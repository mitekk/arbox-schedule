import "dotenv/config";
import { login, logout } from "../api/requests/auth";
import { getSchedule } from "../api/requests/schedule";
import { loadConfig } from "../schedule/config";
import { buildCancelUrl } from "../schedule/cancel";
import { toLocalDate } from "../schedule/utils";

function toISODateZ(d: Date): string {
  return toLocalDate(d) + "T00:00:00.000Z";
}

async function main() {
  const config = loadConfig();

  const today = new Date();
  const in30days = new Date(today);
  in30days.setDate(today.getDate() + 30);

  const {
    data: { token },
  } = await login({ email: config.email, password: config.password });

  try {
    const { data: items } = await getSchedule(token, {
      from: toISODateZ(today),
      to: toISODateZ(in30days),
      locations_box_id: config.locationId,
      boxes_id: config.boxId,
    });

    const booked = items.filter((i) => i.user_booked !== null);
    console.log(`Found ${booked.length} upcoming booking(s):\n`);

    for (const item of booked) {
      const url = buildCancelUrl(item.id, item.date, config);
      console.log(
        `  ${item.date}  ${item.box_categories?.name ?? ""}  id=${item.id}  user_booked=${item.user_booked}`
      );
      console.log(`  ${url ?? "(no cancelSecret/baseUrl configured)"}\n`);
    }
  } finally {
    await logout(token);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
