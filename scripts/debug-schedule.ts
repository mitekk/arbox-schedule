import "dotenv/config";
import { login, logout } from "../api/requests/auth";
import { getSchedule } from "../api/requests/schedule";
import { getProfile } from "../api/requests/user";
import { apiFetch } from "../api/client";
import { loadConfig } from "../schedule/config";
import { toLocalDate } from "../schedule/utils";

function toISODateZ(d: Date): string {
  return toLocalDate(d) + "T00:00:00.000Z";
}

async function main() {
  const config = loadConfig();

  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + 1);
  nextSunday.setHours(0, 0, 0, 0);
  const nextSaturday = new Date(nextSunday);
  nextSaturday.setDate(nextSunday.getDate() + 6);
  nextSaturday.setHours(23, 59, 59, 0);

  const from = toISODateZ(nextSunday);
  const to = toISODateZ(nextSaturday);

  console.log("=== Config ===");
  console.log(`  boxId:              ${config.boxId}`);
  console.log(`  locationId:         ${config.locationId}`);
  console.log(`  membershipId:       ${config.membershipId}`);
  console.log(`  primarySeriesIds:   ${config.primarySeriesIds}`);
  console.log(`  secondarySeriesIds: ${config.secondarySeriesIds}`);
  console.log(`  from: ${from}`);
  console.log(`  to:   ${to}`);

  const {
    data: { token },
  } = await login({ email: config.email, password: config.password });
  console.log("\n=== Login OK ===");

  // Check profile for any useful membership data
  const { data: profile } = await getProfile(token);
  const activeBox = profile.users_boxes.find(
    (ub) => ub.box_fk === config.boxId && ub.active
  );
  console.log(`\n=== Active users_box for boxId ${config.boxId} ===`);
  console.log(JSON.stringify(activeBox, null, 2));

  // Query current week (past classes) to find a booking record with membership_user_fk
  const thisMonday = new Date();
  thisMonday.setDate(thisMonday.getDate() - 6);
  thisMonday.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(23, 59, 59, 0);
  const { data: pastItems } = await getSchedule(token, {
    from: toISODateZ(thisMonday),
    to: toISODateZ(today),
    locations_box_id: config.locationId,
    boxes_id: config.boxId,
  });
  const booked = pastItems.filter((i) => i.user_booked !== null);
  console.log(`\n=== Past week booked classes: ${booked.length} ===`);
  for (const b of booked) {
    console.log(`  id=${b.id}  date=${b.date}  user_booked=${b.user_booked}`);
    console.log(`  schedule_user: ${JSON.stringify(b.schedule_user)}`);
  }

  try {
    const { data: items } = await getSchedule(token, {
      from,
      to,
      locations_box_id: config.locationId,
      boxes_id: config.boxId,
    });

    console.log(`\n=== Schedule response: ${items.length} items ===`);
    for (const item of items) {
      console.log(
        `  series_fk=${item.series_fk}  free=${item.free}  has_spots=${item.has_spots}  date=${item.date}  id=${item.id}`
      );
    }

    const targets = [...config.primarySeriesIds, ...config.secondarySeriesIds];
    console.log("\n=== Target series lookup ===");
    let firstTarget: (typeof items)[0] | undefined;
    for (const sid of targets) {
      const match = items.find((i) => i.series_fk === sid);
      if (match) {
        if (!firstTarget) firstTarget = match;
        console.log(`  ${sid} -> FOUND`);
        console.log(
          `    date=${match.date}  free=${match.free}  stand_by=${match.stand_by}`
        );
        console.log(`    booking_option=${match.booking_option}`);
        console.log(
          `    user_booked=${match.user_booked}  user_in_standby=${match.user_in_standby}`
        );
        console.log(
          `    -> bookClass request: { schedule_id: ${match.id}, membership_user_id: ${config.membershipId} }`
        );
      } else {
        console.log(`  ${sid} -> NOT FOUND`);
      }
    }

    // Attempt the booking of the first target with boxFk header
    if (firstTarget) {
      const ACTUAL_MEMBERSHIP_ID = 15287661;
      const body = {
        schedule_id: firstTarget.id,
        membership_user_id: ACTUAL_MEMBERSHIP_ID,
      };
      console.log(
        `\n=== Attempting booking with correct membership_user_id=${ACTUAL_MEMBERSHIP_ID}: ${JSON.stringify(body)} ===`
      );
      try {
        const result = await apiFetch("/api/v2/scheduleUser/insert", token, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { boxFk: String(config.boxId) },
        });
        console.log("  SUCCESS:", JSON.stringify(result));
      } catch (err) {
        console.log(
          "  FAILED (with boxFk):",
          err instanceof Error ? err.message : err
        );
        // Retry without boxFk to compare
        try {
          const result2 = await apiFetch("/api/v2/scheduleUser/insert", token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          console.log("  SUCCESS (without boxFk):", JSON.stringify(result2));
        } catch (err2) {
          console.log(
            "  FAILED (without boxFk):",
            err2 instanceof Error ? err2.message : err2
          );
        }
      }
    }
  } finally {
    await logout(token);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
