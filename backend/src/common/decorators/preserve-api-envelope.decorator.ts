import { SetMetadata } from "@nestjs/common";

export const PRESERVE_API_ENVELOPE = "preserveApiEnvelope";

export const PreserveApiEnvelope = () =>
  SetMetadata(PRESERVE_API_ENVELOPE, true);
