export interface Config {
  email: string;
  password: string;
  boxId: number;
  locationId: number;
  membershipId: number;
  primarySeriesIds: number[];
  secondarySeriesIds: number[];
  resendApiKey: string;
  notificationEmail: string;
  cancelSecret?: string;
  baseUrl?: string;
  port: number;
  databaseUrl: string;
  triggerToken?: string;
}

export function loadConfig(): Config {
  const required = [
    "ARBOX_EMAIL",
    "ARBOX_PASSWORD",
    "BOX_ID",
    "LOCATION_ID",
    "MEMBERSHIP_ID",
    "PRIMARY_SERIES_IDS",
    "SECONDARY_SERIES_IDS",
    "RESEND_API_KEY",
    "NOTIFICATION_EMAIL",
    "DATABASE_URL",
  ] as const;

  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  return {
    email: process.env.ARBOX_EMAIL!,
    password: process.env.ARBOX_PASSWORD!,
    boxId: parseInt(process.env.BOX_ID!, 10),
    locationId: parseInt(process.env.LOCATION_ID!, 10),
    membershipId: parseInt(process.env.MEMBERSHIP_ID!, 10),
    primarySeriesIds: process.env.PRIMARY_SERIES_IDS!.split(",").map(Number),
    secondarySeriesIds: process.env
      .SECONDARY_SERIES_IDS!.split(",")
      .map(Number),
    resendApiKey: process.env.RESEND_API_KEY!,
    notificationEmail: process.env.NOTIFICATION_EMAIL!,
    cancelSecret: process.env.CANCEL_SECRET || undefined,
    baseUrl: process.env.BASE_URL || undefined,
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: process.env.DATABASE_URL!,
    triggerToken: process.env.TRIGGER_TOKEN || undefined,
  };
}
