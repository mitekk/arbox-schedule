export type MessageKind = "command" | "event";

export interface BookingOutcome {
  className?: string;
  coachName?: string;
  date: string;
  time?: string;
  endTime?: string;
  status: "booked" | "standby";
  standbyPosition?: number;
  cancelUrl?: string;
}

/** Payload shape for every message, keyed by message name. */
export interface MessagePayloads {
  BookingRequested: { weekOf: string };
  StandbyTickRequested: Record<string, never>;
  LessonBooked: {
    scheduleId: number;
    seriesId: number;
    date: string;
    className?: string;
    time?: string;
    endTime?: string;
    coachName?: string;
  };
  StandbyJoined: {
    scheduleId: number;
    seriesId: number;
    date: string;
    className?: string;
    time?: string;
    endTime?: string;
    position?: number;
  };
  BookingSessionCompleted: { weekOf: string; outcomes: BookingOutcome[] };
  StandbyConfirmed: {
    scheduleId: number;
    seriesId: number;
    date: string;
    className?: string;
    time?: string;
    endTime?: string;
  };
  StandbyLost: { scheduleId: number; seriesId: number; date: string };
  StandbyExpired: { scheduleId: number; seriesId: number; date: string };
  BookingCancelled: { scheduleId: number; date: string };
  OperationFailed: {
    operation: string;
    message: string;
    context?: Record<string, unknown>;
  };
}

export type MessageName = keyof MessagePayloads;

/** Commands are directed (one consumer); events are facts (0..N consumers). */
export const MESSAGE_KIND: Record<MessageName, MessageKind> = {
  BookingRequested: "command",
  StandbyTickRequested: "command",
  LessonBooked: "event",
  StandbyJoined: "event",
  BookingSessionCompleted: "event",
  StandbyConfirmed: "event",
  StandbyLost: "event",
  StandbyExpired: "event",
  BookingCancelled: "event",
  OperationFailed: "event",
};

/** Discriminated union over all messages — narrow on `msg.name`. */
export type Message = {
  [N in MessageName]: {
    messageId: string;
    name: N;
    kind: MessageKind;
    payload: MessagePayloads[N];
  };
}[MessageName];

export type ConsumerHandler = (msg: Message) => Promise<void>;

export interface ConsumerEntry {
  consumer: string;
  handle: ConsumerHandler;
}

/** The only wiring: event name -> ordered list of consumers. */
export type Routes = Partial<Record<MessageName, ConsumerEntry[]>>;
