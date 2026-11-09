/** Stable_ID: UUID text assigned at creation and never changed. */
export type Id = string;

/** Any 8-4-4-4-12 hexadecimal text (Req 6.1); not limited to RFC 4122 variants. */
export const UUID_TEXT =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** ID generator port. The app injects `() => crypto.randomUUID()`; tests inject a counter. */
export type IdSource = () => Id;
