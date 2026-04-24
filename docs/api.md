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

### POST /api/v2/scheduleUser/insert

Register the authenticated user for a class (schedule slot).

**Request body:**

```json
{
  "scheduleFk": 12345,
  "locationsBoxFk": 21372,
  "boxFk": 23733,
  "usersFk": 647542
}
```

| Field            | Type | Description                             |
| ---------------- | ---- | --------------------------------------- |
| `scheduleFk`     | int  | ID of the schedule slot to book         |
| `locationsBoxFk` | int  | Location ID (from `activeLocationsBox`) |
| `boxFk`          | int  | Box ID (from `activeBoxes`)             |
| `usersFk`        | int  | User ID (from profile `id`)             |

**Notes:**

- Use schedule IDs obtained from `GET /api/v2/schedule/betweenDates` (requires box admin credentials) or from the Arbox mobile app
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
