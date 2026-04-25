import type { ScheduleItem } from "../../api/types/schedule";
import type { StandbyEntry } from "../../schedule/state";
import type { Config } from "../../schedule/config";

export function makeScheduleItem(
  overrides: Partial<ScheduleItem> = {}
): ScheduleItem {
  return {
    id: 1000,
    time: "07:00",
    end_time: "08:00",
    date: "2026-05-04",
    date_time: { date: "2026-05-04", timezone: "Asia/Jerusalem" },
    end_date_time: { date: "2026-05-04", timezone: "Asia/Jerusalem" },
    day_of_week: 1,
    coach_fk: 10,
    second_coach_fk: null,
    box_category_fk: 20,
    locations_box_fk: 1,
    box_fk: 1,
    series_fk: 101,
    max_users: 20,
    free: 5,
    registered: 15,
    stand_by: 0,
    status: "active",
    past: 0,
    has_spots: 1,
    live_link: null,
    spaces_id: null,
    workout_id: null,
    late_cancellation: null,
    disable_cancellation_time: 0,
    enable_late_cancellation: 0,
    enable_registration_time: 0,
    user_booked: null,
    user_in_standby: null,
    stand_by_position: null,
    booking_option: "default",
    availability_id: null,
    is_swappable_schedule: false,
    reschedule: false,
    box: {
      id: 1,
      name: "Test Gym",
      has_regular_clients: 0,
      cloudinary_image: "",
      phone: "",
    },
    box_categories: {
      id: 20,
      name: "CrossFit",
      bio: null,
      category_color: "#fff",
      length: 60,
      price: null,
      type: 1,
      color_name: "white",
      category_type: { id: 1, name: "Fitness" },
    },
    coach: {
      id: 10,
      first_name: "John",
      last_name: "Doe",
      full_name: "John Doe",
      image: "",
      cloudinary_image: "",
      bio: null,
      is_user: false,
    },
    second_coach: null,
    series: {
      id: 101,
      series_name: "CrossFit Morning",
      start_date: "2026-01-01",
      end_date: null,
      start_time: "07:00",
      end_time: "08:00",
      status: "active",
      day: "Monday",
      max_users: 20,
      coach_fk: 10,
      membership_types: [],
    },
    booked_users: [],
    schedule_user: [],
    schedule_stand_by: [],
    custom_field_value: [],
    disable_pages_app: [],
    spaces: null,
    ...overrides,
  };
}

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    email: "test@example.com",
    password: "password",
    boxId: 1,
    locationId: 1,
    membershipId: 999,
    primarySeriesIds: [101],
    secondarySeriesIds: [202],
    resendApiKey: "re_test_key",
    notificationEmail: "notify@example.com",
    ...overrides,
  };
}

export function makeStandbyEntry(
  overrides: Partial<StandbyEntry> = {}
): StandbyEntry {
  return {
    scheduleId: 1001,
    seriesId: 101,
    date: "2026-05-10",
    ...overrides,
  };
}
