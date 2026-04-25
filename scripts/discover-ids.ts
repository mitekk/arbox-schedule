import "dotenv/config";
import { login, logout } from "../api/requests/auth";
import { getProfile } from "../api/requests/user";
import { getSchedule } from "../api/requests/schedule";
import { toLocalDate } from "../schedule/utils";

function toISODateZ(d: Date): string {
  return toLocalDate(d) + "T00:00:00.000Z";
}

async function main() {
  const email = process.env.ARBOX_EMAIL;
  const password = process.env.ARBOX_PASSWORD;
  if (!email || !password)
    throw new Error("ARBOX_EMAIL and ARBOX_PASSWORD must be set in .env");

  const {
    data: { token },
  } = await login({ email, password });

  try {
    const { data: profile } = await getProfile(token);

    console.log("\nActive box memberships:\n");
    for (const ub of profile.users_boxes) {
      if (!ub.active) continue;

      console.log(`Box: ${ub.box.name}`);
      console.log(`  BOX_ID=${ub.box_fk}`);
      console.log(`  LOCATION_ID=${ub.locations_box_fk}`);

      // membership_user_fk (needed for booking) is not in the profile response.
      // Find it by looking at a past week's schedule for any class the user booked.
      const past = new Date();
      past.setDate(past.getDate() - 14);
      past.setHours(0, 0, 0, 0);
      const now = new Date();

      const { data: items } = await getSchedule(token, {
        from: toISODateZ(past),
        to: toISODateZ(now),
        locations_box_id: ub.locations_box_fk,
        boxes_id: ub.box_fk,
      });

      let membershipUserId: number | null = null;
      for (const item of items) {
        if (item.user_booked === null) continue;
        const entry = (
          item.schedule_user as { id: number; membership_user_fk: number }[]
        ).find((su) => su.id === profile.id);
        if (entry) {
          membershipUserId = entry.membership_user_fk;
          break;
        }
      }

      if (membershipUserId !== null) {
        console.log(`  MEMBERSHIP_ID=${membershipUserId}`);
      } else {
        console.log(
          `  MEMBERSHIP_ID=<not found — no past bookings in last 14 days; check manually>`
        );
      }
      console.log("");
    }
  } finally {
    await logout(token);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
