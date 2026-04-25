import "dotenv/config";
import { login } from "../api/requests/auth";
import { getProfile } from "../api/requests/user";

async function main() {
  const email = process.env.ARBOX_EMAIL;
  const password = process.env.ARBOX_PASSWORD;
  if (!email || !password)
    throw new Error("ARBOX_EMAIL and ARBOX_PASSWORD must be set in .env");

  const {
    data: { token },
  } = await login({ email, password });
  const { data: profile } = await getProfile(token);

  console.log("\nActive box memberships:\n");
  for (const ub of profile.users_boxes) {
    if (ub.active) {
      console.log(`Box: ${ub.box.name}`);
      console.log(`  BOX_ID=${ub.box_fk}`);
      console.log(`  LOCATION_ID=${ub.locations_box_fk}`);
      console.log(`  MEMBERSHIP_ID=${ub.ub_id}`);
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
