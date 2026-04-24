# Arbox API v2 — Unofficial Reference

> Reverse-engineered via live probing and open-source analysis. Not officially published by Arbox.
> Base URL: `https://apiappv2.arboxapp.com`

---

## Authentication

### Flow

1. `POST /api/v2/user/login` with email + password
2. Receive a JWT `token` and `refreshToken`
3. Pass `token` in the `accesstoken` header on every subsequent request

### Required Headers (all authenticated requests)

| Header         | Value              | Notes                  |
| -------------- | ------------------ | ---------------------- |
| `accesstoken`  | `<JWT token>`      | From login response    |
| `version`      | `11`               | App version identifier |
| `referername`  | `app`              | Client identifier      |
| `Content-Type` | `application/json` | For POST requests      |

### Optional / Contextual Headers

| Header         | Notes                                            |
| -------------- | ------------------------------------------------ |
| `refreshToken` | Pass alongside `accesstoken` for session refresh |
| `whiteLabel`   | Box white-label identifier (e.g. `dVqGag1c`)     |
| `boxFk`        | Box ID — some endpoints require this as a header |
| `lang`         | Language code (e.g. `en`, `he`)                  |
| `identifier`   | Location/context identifier                      |

---

## Endpoints

### POST /api/v2/user/login

Authenticate and receive tokens.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response:**

```json
{
  "data": {
    "id": 647542,
    "email": "user@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "language": "en",
    "image": "https://res.cloudinary.com/arbox/image/upload/...",
    "token": "<JWT access token>",
    "refreshToken": "<JWT refresh token>",
    "last_name_shorten": "D",
    "full_name_shorten": "Jane D",
    "full_name": "Jane Doe",
    "is_user": true,
    "appNamesId": 1
  }
}
```

**Notes:**

- `token` is a long-lived JWT (expiry ~years). Decode to inspect claims.
- `appNamesId: 1` = standard Arbox app.
- No `whitelabel` required for login.

---

### POST /api/v2/user/logout

Invalidate the current session token.

**Request body:** `{}` (empty)

**Response:** `OK` (plain text, HTTP 200)

---

### GET /api/v2/user/profile

Returns full profile for the authenticated user, including all box memberships, locations, last membership, and push token.

**Response (key fields):**

```json
{
  "data": {
    "id": 647542,
    "email": "user@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "language": "en",
    "on_boarding": 1,
    "image": "https://res.cloudinary.com/arbox/...",
    "birthday": "1983-05-03",
    "gender": "male",
    "phone": "0547684502",
    "weight": "70",
    "height": "170",
    "country": null,
    "city": "Tel Aviv",
    "address": "Some Street 1",
    "bio": null,
    "zip": null,
    "state": null,
    "time_format_preferred": "HOUR-24",
    "last_login": "2026-04-24 23:02:36",
    "verified": 1,
    "created_at": "2019-10-28T15:41:51.000000Z",
    "updated_at": "2026-04-24T20:02:36.000000Z",
    "boxes": [23733, 926],
    "activeBoxes": [23733],
    "activeLocationsBox": [21372],
    "inactiveBoxes": [926],
    "allBoxes": [23733, 926],
    "locations": [21372, 1276],
    "refreshToken": "<new refresh token>",
    "appNamesId": 1,
    "dateFormat": "DD/MM/YYYY",
    "timeFormat": "HH:mm",
    "timeZone": "Asia/Jerusalem",
    "currencySymbol": "₪",
    "slug": "arboxv4",
    "last_name_shorten": "D",
    "full_name": "Jane Doe",
    "is_user": true,
    "user_token": "ExponentPushToken[...]",
    "friend_connection": [],
    "lastEndedMembership": {
      "id": 1340141,
      "membership_type_fk": 26902,
      "box_fk": 926,
      "sessions_left": null,
      "end": "2023-04-18",
      "membership_types": {
        "id": 26902,
        "name": "Monthly Plan",
        "type": "plan",
        "price": 0,
        "sessions": null,
        "is_recurring_payment": 0
      },
      "box": { "id": 926, "name": "Toha Gym", "phone": "03-7356164" }
    },
    "users_boxes": [
      /* see UserBox model below */
    ]
  }
}
```

**Notes:**

- `boxes` = all box IDs user belongs to (active + inactive)
- `activeBoxes` = currently active box IDs
- `activeLocationsBox` = currently active `locations_box` IDs
- `users_boxes` = full membership records for each box (see UserBox model)
- `user_token` = Expo push notification token for the user's mobile device

---

### POST /api/v2/user/resetPassword

Initiate a password reset. Likely sends an email with a reset link.

**Request body:** (probe — exact required fields unknown)

```json
{
  "email": "user@example.com"
}
```

**Auth required:** No (unauthenticated endpoint, HTTP method: POST)

---

### POST /api/v2/user/changePassword

Change password for the authenticated user.

**Request body:** (probe — exact fields unknown)

```json
{
  "old_password": "current",
  "new_password": "newpass"
}
```

**Auth required:** Yes

---

### GET /api/v2/boxes

Returns all box memberships for the authenticated user, with full box details and location info.

**Response:**

```json
{
  "data": [
    {
      "ub_id": 9116963,
      "id": 9116963,
      "first_name": "Jane",
      "last_name": "Doe",
      "birthday": "1983-05-03",
      "personal_id": null,
      "gender": "male",
      "phone": "0547684502",
      "additional_phone": null,
      "user_fk": 647542,
      "box_fk": 23733,
      "locations_box_fk": 21372,
      "medical_cert": 1,
      "epidemic_statement": 0,
      "has_waiver": 1,
      "active": 1,
      "rolesArray": [3],
      "full_name": "Jane Doe",
      "total_debt": 0,
      "age": "42.11",
      "user_image": "",
      "is_app_deleted": false,
      "schedule_favorites": [],
      "properties": [],
      "group_connection": null,
      "box": {
        "id": 23733,
        "name": "power house - by limor",
        "phone": "+972549259926",
        "email": "gym@example.com",
        "address": "Tel Aviv",
        "city": "Tel Aviv",
        "country": "Israel",
        "cloudinary_image": "https://res.cloudinary.com/arbox/...",
        "bio": null,
        "website": null,
        "has_regular_clients": 0,
        "epidemic_mode": 0,
        "notification_scheduling": 12,
        "external_url_id": "dVqGag1c",
        "box_type_fk": 2,
        "box_type": {
          "id": 2,
          "translations": { "segment": "fitness" }
        },
        "boxes_settings": [
          {
            "id": 6031,
            "prop_name": "recurring_payments",
            "properties": {
              "allowUpdateCC": true,
              "holdFrequency": 0,
              "relativeFrequency": 2
            }
          }
        ]
      },
      "locations_box": {
        "id": 21372,
        "qr_code": 0,
        "logo": null,
        "time_format": "HH:mm",
        "date_format": "DD/MM/YYYY",
        "timezone": "Asia/Jerusalem",
        "country_code": "IL",
        "currency": "ILS",
        "currency_symbol": "₪",
        "has_shop": true,
        "disable_pages_app": []
      }
    }
  ]
}
```

**Notes:**

- `rolesArray` values: `3` = member, `2` = staff/coach, `1` = admin (inferred)
- `total_debt` = outstanding balance in the box's currency
- `schedule_favorites` = array of favourite schedule class IDs
- `disable_pages_app` = feature flags hiding sections in the mobile app
- `boxes_settings` = box-level configuration properties (e.g. recurring payment settings)

---

### GET /api/v2/boxes/locations

Returns all boxes the user belongs to, with full location details and feature flags.

**Response:**

```json
{
  "data": [
    {
      "id": 926,
      "name": "Toha Gym",
      "address": "Yigal Alon 114, Tel Aviv",
      "city": "Tel Aviv",
      "country": "Israel",
      "phone": "03-7356164",
      "email": "gym@example.com",
      "website": "",
      "cloudinary_image": "https://res.cloudinary.com/arbox/...",
      "box_type_fk": 14,
      "schedule_standby_offset": 0,
      "epidemic_mode": 0,
      "showing_classes_week_ago": 0,
      "showing_classes_day_ago": null,
      "showing_classes_time_ago": null,
      "has_regular_clients": 0,
      "notification_scheduling": 1,
      "standby_cancellation_time": 300,
      "schedule_swapping_time": 0,
      "schedule_swapping_standby_time": 0,
      "time_card": 1,
      "external_url_id": "32434244",
      "bio": "...",
      "allow_sms_to_waiting_list": 0,
      "allow_relative_payment": 0,
      "digital_form_id": null,
      "notify_session_owner": 3,
      "scheduleTypes": {
        "hasClasses": 47,
        "hasHistory": 1
      },
      "locations_box": [
        {
          "id": 1276,
          "location": "Tel Aviv",
          "box_fk": 926,
          "logo": null,
          "timezone": "Asia/Jerusalem",
          "qr_code": 0,
          "hasAvailability": 3,
          "hasSpaceAvailability": 0,
          "hasWorkshops": 0,
          "hasHugim": 0,
          "hasPayments": true,
          "hasMemberships": false,
          "hasProducts": false,
          "custom_field": [],
          "currency_symbol": "",
          "has_shop": true,
          "disable_pages_app": [
            {
              "locations_box_id": 1276,
              "area": "schedule",
              "section_name": "whoIsBooked"
            },
            {
              "locations_box_id": 1276,
              "area": "schedule",
              "section_name": "standBy"
            },
            {
              "locations_box_id": 1276,
              "area": "sidebar",
              "section_name": "logBook"
            }
          ]
        }
      ]
    }
  ]
}
```

**Notes:**

- Returns all boxes (active + inactive), not filtered by params
- `standby_cancellation_time` = minutes before class that standby auto-cancels
- `scheduleTypes.hasClasses` = total class count in this box
- `hasAvailability` — values: `0` = disabled, `1` = count only, `2` = names visible, `3` = full visibility
- `hasHugim` = whether the box uses "hugim" (recurring group sessions, Israeli term)
- `disable_pages_app` = sections hidden in the mobile app for this location

---

### POST /api/v2/schedule/betweenDates

List all available classes/lessons in a date range for a given location. Returns full class detail including spots, coach, category, and whether the authenticated user has booked.

**Request body:**

```json
{
  "from": "2026-04-25T00:00:00.000Z",
  "to": "2026-05-02T00:00:00.000Z",
  "locations_box_id": 21372,
  "boxes_id": 23733
}
```

| Field              | Type   | Description                                        |
| ------------------ | ------ | -------------------------------------------------- |
| `from`             | string | Start of range — ISO 8601 datetime with `Z` suffix |
| `to`               | string | End of range — ISO 8601 datetime with `Z` suffix   |
| `locations_box_id` | int    | Location ID (from `activeLocationsBox`)            |
| `boxes_id`         | int    | Box ID (from `activeBoxes`)                        |

**Response:**

```json
{
  "data": [
    {
      "id": 75223992,
      "time": "08:10",
      "end_time": "09:00",
      "date": "2026-04-26",
      "date_time": {
        "date": "2026-04-26 08:10:00",
        "timezone": "Asia/Jerusalem"
      },
      "end_date_time": {
        "date": "2026-04-26 09:00:00",
        "timezone": "Asia/Jerusalem"
      },
      "day_of_week": 0,
      "coach_fk": 556108,
      "second_coach_fk": null,
      "box_category_fk": 155160,
      "locations_box_fk": 21372,
      "box_fk": 23733,
      "series_fk": 562437,
      "max_users": 18,
      "free": 2,
      "registered": 16,
      "stand_by": 0,
      "status": "active",
      "past": 0,
      "has_spots": 0,
      "live_link": null,
      "spaces_id": null,
      "workout_id": null,
      "late_cancellation": null,
      "disable_cancellation_time": 3,
      "enable_late_cancellation": 1,
      "enable_registration_time": 0,
      "user_booked": null,
      "user_in_standby": null,
      "stand_by_position": null,
      "booking_option": "insertScheduleUser",
      "is_swappable_schedule": false,
      "reschedule": false,
      "box": {
        "id": 23733,
        "name": "power house - by limor",
        "has_regular_clients": 0,
        "cloudinary_image": "https://res.cloudinary.com/arbox/...",
        "phone": "+972549259926"
      },
      "box_categories": {
        "id": 155160,
        "name": "אימון מחזורי",
        "bio": null,
        "category_color": "#FBD0E8",
        "length": 50,
        "price": null,
        "type": 1,
        "color_name": "cat-color-8",
        "category_type": { "id": 1, "name": "class" }
      },
      "coach": {
        "id": 556108,
        "first_name": "לימור",
        "last_name": "ממון",
        "full_name": "לימור ממון",
        "image": "",
        "cloudinary_image": "",
        "bio": null,
        "is_user": true
      },
      "second_coach": null,
      "series": {
        "id": 562437,
        "series_name": "אימון מחזורי,ראשון,08:10",
        "start_date": "2025-11-12",
        "end_date": null,
        "start_time": "08:10:00",
        "end_time": "09:00:00",
        "status": "active",
        "day": "day-1",
        "max_users": 18,
        "coach_fk": 556108,
        "membership_types": [
          {
            "id": 383509,
            "name": "אימון מחזורי",
            "type": "trial",
            "price": 35,
            "show_in_app": 1
          }
        ]
      },
      "booked_users": [
        /* array of booked user objects */
      ],
      "schedule_user": [
        /* same as booked_users */
      ],
      "schedule_stand_by": [],
      "custom_field_value": [],
      "disable_pages_app": [],
      "spaces": null
    }
  ]
}
```

**Key response fields per item:**

| Field                     | Type      | Description                                                                                                                                                                      |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | int       | Schedule slot ID — use this in `scheduleUser/insert` and `scheduleUser/delete`                                                                                                   |
| `date`                    | string    | Class date `YYYY-MM-DD`                                                                                                                                                          |
| `time`                    | string    | Start time `HH:MM`                                                                                                                                                               |
| `end_time`                | string    | End time `HH:MM`                                                                                                                                                                 |
| `max_users`               | int       | Maximum capacity                                                                                                                                                                 |
| `free`                    | int       | Available spots                                                                                                                                                                  |
| `registered`              | int       | Currently booked count                                                                                                                                                           |
| `stand_by`                | int       | Standby list count                                                                                                                                                               |
| `has_spots`               | int       | **Not a reliable availability flag** — can be `0` even when `free > 0` (e.g. current user's membership type doesn't cover this class). Use `free` to check availability instead. |
| `status`                  | string    | `"active"` = bookable                                                                                                                                                            |
| `past`                    | int       | `1` if class is in the past                                                                                                                                                      |
| `user_booked`             | int\|null | `null` if not booked by current user; schedule_user record ID if booked                                                                                                          |
| `user_in_standby`         | int\|null | Standby record ID if on waitlist                                                                                                                                                 |
| `booking_option`          | string    | `"insertScheduleUser"` = use `scheduleUser/insert` to book                                                                                                                       |
| `box_categories.name`     | string    | Class type name (e.g. `"HIIT"`, `"Booty Workout"`)                                                                                                                               |
| `coach.full_name`         | string    | Coach's display name                                                                                                                                                             |
| `series`                  | object    | Recurring series this class belongs to                                                                                                                                           |
| `series.membership_types` | array     | Membership plans that can be used to book this class                                                                                                                             |

**Notes:**

- `from`/`to` must be in ISO 8601 format with milliseconds and `Z` suffix
- The date range can span multiple days or weeks
- `user_booked` is `null` for unbooked classes and a record ID if the authenticated user has booked
- `booking_option: "insertScheduleUser"` indicates the class is bookable via `POST /api/v2/scheduleUser/insert`
- **Do not use `has_spots` as a boolean to check availability.** It reflects eligibility for the current user (e.g. membership coverage), not raw spot count. Use `free > 0` or `max_users - registered > 0` instead.

---

### POST /api/v2/scheduleUser/insert

Register the authenticated user for a class (schedule slot).

**Request body:**

```json
{
  "schedule_id": 75223992,
  "membership_user_id": 14285177
}
```

| Field                | Type | Description                                                                                  |
| -------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `schedule_id`        | int  | ID of the schedule slot (from `schedule/betweenDates` response `id` field)                   |
| `membership_user_id` | int  | User's active membership record ID (from `users_boxes[].schedule_user[].membership_user_fk`) |

**Notes:**

- Obtain `schedule_id` from `POST /api/v2/schedule/betweenDates`
- Returns an error if the class is full

---

### POST /api/v2/scheduleUser/delete

Cancel a class booking.

**Request body:**

```json
{
  "scheduleFk": 12345,
  "locationsBoxFk": 21372,
  "boxFk": 23733
}
```

---

### POST /api/v2/scheduleStandBy/insert

Join the waiting list for a fully-booked class.

**Request body:** (same shape as `scheduleUser/insert`)

```json
{
  "schedule_id": 75223992,
  "membership_user_id": 14285177
}
```

| Field                | Type | Description                                                |
| -------------------- | ---- | ---------------------------------------------------------- |
| `schedule_id`        | int  | Schedule slot ID (from `schedule/betweenDates` `id` field) |
| `membership_user_id` | int  | User's active membership record ID                         |

**Response (success):** HTTP 200 with standby record

**Error responses:**

| Code | Name                | Meaning                                                     |
| ---- | ------------------- | ----------------------------------------------------------- |
| 425  | `alreadyRegistered` | Already booked (or on standby) for a class at that timeslot |

**Notes:**

- Only call this when `free == 0` on the schedule item; if spots are available, use `scheduleUser/insert` instead
- After joining, `user_in_standby` will be non-null and `stand_by_position` will reflect queue position in the `schedule/betweenDates` response
- `schedule_stand_by` array on the schedule item lists all users currently on the waitlist

---

### POST /api/v2/scheduleStandBy/delete

Leave the waiting list for a class.

**Request body:** (same shape as `scheduleUser/insert`)

```json
{
  "schedule_id": 75223992,
  "membership_user_id": 14285177
}
```

**Notes:**

- Only valid if the user is currently on the standby list for that schedule slot
- Returns 500 if the user has no standby record for the given `schedule_id`

---

### POST /api/v2/scheduleUser/insert (standby confirmation)

Confirm a standby spot that has opened up. When a cancellation creates a vacancy, Arbox notifies the first standby user by email/push notification and creates an **availability record**. The user has 30 minutes to confirm before the offer expires and moves to the next standby user.

**Confirmation is done via the same `scheduleUser/insert` endpoint, but with the additional `availability_id` field:**

```json
{
  "schedule_id": 75223992,
  "membership_user_id": 14285177,
  "availability_id": 98765
}
```

| Field                | Type | Description                                                               |
| -------------------- | ---- | ------------------------------------------------------------------------- |
| `schedule_id`        | int  | Schedule slot ID                                                          |
| `membership_user_id` | int  | User's active membership record ID                                        |
| `availability_id`    | int  | The availability record ID from the schedule item or notification payload |

**How to obtain `availability_id`:**

- When a standby spot opens for the authenticated user, the `schedule/betweenDates` response will show `availability_id` as a non-null integer on that specific schedule item (it is `null` for all other classes)
- The push notification / email link also carries this ID

**Flow:**

1. User joins standby via `scheduleStandBy/insert`
2. A cancellation occurs, freeing a spot
3. Arbox sets `availability_id` on the schedule item and sends a push/email notification
4. User polls `schedule/betweenDates` or receives a push notification to get the `availability_id`
5. User calls `scheduleUser/insert` with `availability_id` within 30 minutes
6. If 30 minutes elapse without confirmation, the `availability_id` expires and the next standby user is notified

**Error responses:**

| Code                | Meaning                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| 403 `Unknown issue` | `availability_id` is invalid, expired, or does not belong to this user |

---

## Data Models

### User

| Field                   | Type      | Description                         |
| ----------------------- | --------- | ----------------------------------- |
| `id`                    | int       | Unique user ID                      |
| `email`                 | string    | Email address                       |
| `first_name`            | string    | First name                          |
| `last_name`             | string    | Last name                           |
| `language`              | string    | `"en"` or `"he"`                    |
| `birthday`              | string    | `YYYY-MM-DD`                        |
| `gender`                | string    | `"male"` / `"female"`               |
| `phone`                 | string    | Primary phone                       |
| `weight`                | string    | Weight (kg)                         |
| `height`                | string    | Height (cm)                         |
| `image`                 | string    | Cloudinary image URL                |
| `verified`              | int       | Email verified: `1` = yes           |
| `on_boarding`           | int       | Onboarding complete: `1` = yes      |
| `time_format_preferred` | string    | `"HOUR-24"` or `"HOUR-12"`          |
| `dateFormat`            | string    | e.g. `"DD/MM/YYYY"`                 |
| `timeFormat`            | string    | e.g. `"HH:mm"`                      |
| `timeZone`              | string    | e.g. `"Asia/Jerusalem"`             |
| `currencySymbol`        | string    | e.g. `"₪"`                          |
| `slug`                  | string    | App version slug (e.g. `"arboxv4"`) |
| `user_token`            | string    | Expo push notification token        |
| `boxes`                 | int[]     | All box IDs                         |
| `activeBoxes`           | int[]     | Active box IDs                      |
| `inactiveBoxes`         | int[]     | Inactive box IDs                    |
| `activeLocationsBox`    | int[]     | Active location IDs                 |
| `locations`             | int[]     | All location IDs                    |
| `lastEndedMembership`   | object    | Most recent expired membership      |
| `users_boxes`           | UserBox[] | Membership records per box          |

### UserBox (membership record)

| Field                | Type  | Description                                   |
| -------------------- | ----- | --------------------------------------------- |
| `ub_id`              | int   | Unique membership record ID                   |
| `user_fk`            | int   | User ID                                       |
| `box_fk`             | int   | Box ID                                        |
| `locations_box_fk`   | int   | Location ID                                   |
| `active`             | int   | `1` = active, `0` = inactive                  |
| `rolesArray`         | int[] | Roles: `1` = admin, `2` = staff, `3` = member |
| `total_debt`         | int   | Outstanding balance                           |
| `medical_cert`       | int   | Medical certificate on file: `1` = yes        |
| `has_waiver`         | int   | Waiver signed: `1` = yes                      |
| `epidemic_statement` | int   | Epidemic statement signed                     |
| `schedule_favorites` | int[] | Favourite class type IDs                      |
| `properties`         | array | Custom profile properties                     |
| `is_app_deleted`     | bool  | Whether user deleted the app                  |

### Box

| Field                           | Type      | Description                                         |
| ------------------------------- | --------- | --------------------------------------------------- |
| `id`                            | int       | Box ID                                              |
| `name`                          | string    | Display name                                        |
| `phone`                         | string    | Contact phone                                       |
| `email`                         | string    | Contact email                                       |
| `address`                       | string    | Street address                                      |
| `city`                          | string    | City                                                |
| `country`                       | string    | Country                                             |
| `cloudinary_image`              | string    | Logo/image URL                                      |
| `bio`                           | string    | Description                                         |
| `external_url_id`               | string    | White-label identifier (use as `whiteLabel` header) |
| `box_type_fk`                   | int       | Box type ID                                         |
| `box_type.translations.segment` | string    | Type label, e.g. `"fitness"`                        |
| `epidemic_mode`                 | int       | Epidemic restrictions active                        |
| `notification_scheduling`       | int       | Hours before class to send notification             |
| `recurring_payments_charge_day` | int\|null | Monthly billing day                                 |
| `boxes_settings`                | object[]  | Box configuration properties                        |

### LocationsBox

| Field                       | Type     | Description                                                         |
| --------------------------- | -------- | ------------------------------------------------------------------- |
| `id`                        | int      | Location ID                                                         |
| `location`                  | string   | Location label                                                      |
| `box_fk`                    | int      | Parent box ID                                                       |
| `timezone`                  | string   | e.g. `"Asia/Jerusalem"`                                             |
| `country_code`              | string   | ISO country code                                                    |
| `currency`                  | string   | ISO currency code                                                   |
| `currency_symbol`           | string   | Display symbol                                                      |
| `qr_code`                   | int      | QR check-in enabled                                                 |
| `has_shop`                  | bool     | Shop/store enabled                                                  |
| `hasPayments`               | bool     | Payments enabled                                                    |
| `hasMemberships`            | bool     | Membership plans available                                          |
| `hasProducts`               | bool     | Product catalogue available                                         |
| `hasAvailability`           | int      | Visibility of class spots: `0`=none, `1`=count, `2`=names, `3`=full |
| `hasWorkshops`              | bool     | Workshops enabled                                                   |
| `hasHugim`                  | bool     | Recurring group sessions enabled                                    |
| `standby_cancellation_time` | int      | Minutes before class for standby auto-cancel                        |
| `schedule_standby_offset`   | int      | Hours before class that standby opens                               |
| `schedule_swapping_time`    | int      | Hours before class that swaps are allowed                           |
| `custom_field`              | array    | Custom user profile fields for this location                        |
| `disable_pages_app`         | object[] | Sections hidden in mobile app                                       |

---

## Error Responses

```json
{
  "statusCode": 401,
  "error": {
    "message": "Unauthorized",
    "messageToUser": "Forbidden",
    "code": 401
  },
  "data": null
}
```

| Code  | Meaning                                                                 |
| ----- | ----------------------------------------------------------------------- |
| `401` | Missing/invalid `accesstoken`, or insufficient role for the endpoint    |
| `500` | Server error — usually missing required parameters or insufficient role |
| `405` | Wrong HTTP method (e.g. GET on a POST-only endpoint)                    |
| `404` | Endpoint does not exist                                                 |

---

## Quick Reference — Confirmed Working

| Method | Endpoint                      | Auth | Description                     |
| ------ | ----------------------------- | ---- | ------------------------------- |
| POST   | `/api/v2/user/login`          | No   | Get token                       |
| POST   | `/api/v2/user/logout`         | Yes  | Invalidate token                |
| GET    | `/api/v2/user/profile`        | Yes  | Full user profile               |
| POST   | `/api/v2/user/resetPassword`  | No   | Trigger password reset email    |
| POST   | `/api/v2/user/changePassword` | Yes  | Change password                 |
| GET    | `/api/v2/boxes`               | Yes  | User's box memberships          |
| GET    | `/api/v2/boxes/locations`     | Yes  | All boxes with location details |
| POST   | `/api/v2/scheduleUser/insert` | Yes  | Book a class                    |
| POST   | `/api/v2/scheduleUser/delete` | Yes  | Cancel a booking                |

---

## Notes

- **Two API hosts**: `apiappv2.arboxapp.com` (v2, JWT auth) and `apiapp.arboxapp.com/index.php/api/v1` (v1, API key auth). They are separate systems.
- **JWT expiry**: Tokens appear to be very long-lived (years). Refresh tokens have a shorter window (~30 days based on claims).
- **No official docs**: Arbox has not published a public API reference. All information here is reverse-engineered.
