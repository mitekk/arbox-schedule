export interface BookClassRequest {
  schedule_id: number;
  membership_user_id: number;
  availability_id?: number;
}

export interface CancelClassRequest {
  scheduleFk: number;
  locationsBoxFk: number;
  boxFk: number;
}

export interface StandByRequest {
  schedule_id: number;
  membership_user_id: number;
}

export interface ScheduleBetweenDatesRequest {
  from: string;
  to: string;
  locations_box_id: number;
  boxes_id: number;
}

export interface CategoryType {
  id: number;
  name: string;
}

export interface BoxCategory {
  id: number;
  name: string;
  bio: string | null;
  category_color: string;
  length: number;
  price: number | null;
  type: number;
  color_name: string;
  category_type: CategoryType;
}

export interface Coach {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  image: string;
  cloudinary_image: string;
  bio: string | null;
  is_user: boolean;
}

export interface MembershipType {
  id: number;
  name: string;
  type: string;
  price: number;
  show_in_app: number;
}

export interface Series {
  id: number;
  series_name: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  status: string;
  day: string;
  max_users: number;
  coach_fk: number;
  membership_types: MembershipType[];
}

export interface ScheduleItem {
  id: number;
  time: string;
  end_time: string;
  date: string;
  date_time: { date: string; timezone: string };
  end_date_time: { date: string; timezone: string };
  day_of_week: number;
  coach_fk: number;
  second_coach_fk: number | null;
  box_category_fk: number;
  locations_box_fk: number;
  box_fk: number;
  series_fk: number;
  max_users: number;
  free: number;
  registered: number;
  stand_by: number;
  status: string;
  past: number;
  has_spots: number;
  live_link: string | null;
  spaces_id: number | null;
  workout_id: number | null;
  late_cancellation: number | null;
  disable_cancellation_time: number;
  enable_late_cancellation: number;
  enable_registration_time: number;
  user_booked: number | null;
  user_in_standby: number | null;
  stand_by_position: number | null;
  booking_option: string;
  availability_id: number | null;
  is_swappable_schedule: boolean;
  reschedule: boolean;
  box: {
    id: number;
    name: string;
    has_regular_clients: number;
    cloudinary_image: string;
    phone: string;
  };
  box_categories: BoxCategory;
  coach: Coach;
  second_coach: Coach | null;
  series: Series;
  booked_users: unknown[];
  schedule_user: unknown[];
  schedule_stand_by: unknown[];
  custom_field_value: unknown[];
  disable_pages_app: unknown[];
  spaces: unknown | null;
}

export interface ScheduleResponse {
  data: ScheduleItem[];
}
