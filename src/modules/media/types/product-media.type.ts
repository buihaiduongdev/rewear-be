import type { MediaRole, MediaType } from '../enums';

export interface ProductMediaView {
  id: string;
  url: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
  role: MediaRole;
  angle: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
