export type TruecallerCallback = {
  requestId: string;
  requestNonce?: string;
  status?: "flow_invoked" | "user_rejected";
  accessToken?: string;
  endpoint?: string;
};

export type TruecallerProfile = {
  id?: string | number;
  userId?: string | number;
  name?: { first?: string; last?: string; full?: string };
  phoneNumbers?: string[];
  avatarUrl?: string;
  onlineIdentities?: { email?: string };
};

export type TruecallerAttemptStatus =
  | "pending"
  | "flow_invoked"
  | "callback_received"
  | "processing"
  | "rejected"
  | "complete"
  | "failed";
