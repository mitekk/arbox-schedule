import type { Box, LocationsBox } from "./boxes";

export interface UserBox {
  ub_id: number;
  id: number;
  first_name: string;
  last_name: string;
  birthday: string | null;
  personal_id: string | null;
  gender: string;
  phone: string;
  additional_phone: string | null;
  user_fk: number;
  box_fk: number;
  locations_box_fk: number;
  medical_cert: number;
  epidemic_statement: number;
  has_waiver: number;
  country: string | null;
  zip: string | null;
  state: string | null;
  address: string | null;
  city: string | null;
  active: number;
  rolesArray: number[];
  full_name: string;
  total_debt: number;
  age: string | null;
  user_image: string;
  is_app_deleted: boolean;
  box: Box;
  locations_box: LocationsBox;
  schedule_favorites: number[];
  properties: unknown[];
  group_connection: unknown | null;
}

export interface LastEndedMembership {
  id: number;
  membership_type_fk: number;
  box_fk: number;
  sessions_left: number | null;
  end: string;
  membership_types: {
    id: number;
    name: string;
    type: string;
    price: number;
    sessions: number | null;
    is_recurring_payment: number;
  };
  box: { id: number; name: string; phone: string };
}

export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  language: string;
  on_boarding: number;
  image: string;
  birthday: string;
  gender: string;
  phone: string;
  weight: string;
  height: string;
  country: string | null;
  city: string;
  address: string;
  bio: string | null;
  zip: string | null;
  state: string | null;
  time_format_preferred: string;
  last_login: string;
  verified: number;
  created_at: string;
  updated_at: string;
  boxes: number[];
  activeBoxes: number[];
  activeLocationsBox: number[];
  inactiveBoxes: number[];
  allBoxes: number[];
  locations: number[];
  refreshToken: string;
  appNamesId: number;
  dateFormat: string;
  timeFormat: string;
  timeZone: string;
  currencySymbol: string;
  slug: string;
  last_name_shorten: string;
  full_name_shorten: string;
  full_name: string;
  is_user: boolean;
  user_token: string;
  friend_connection: unknown[];
  lastEndedMembership: LastEndedMembership | null;
  users_boxes: UserBox[];
}

export interface UserProfileResponse {
  data: UserProfile;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}
