import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/common/entities';
import { DisputeEvidence } from '@/modules/dispute/entities/dispute.entity';

import { ChatMedia } from './chat.entity';

@Entity('chat_dispute_evidence_links')
@Index(['mediaId', 'orderId', 'importedById'], { unique: true })
export class ChatEvidenceLink extends BaseEntity {
  @Column('uuid')
  mediaId: string;
  @ManyToOne(() => ChatMedia, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mediaId' })
  media: ChatMedia;
  @Column('uuid')
  orderId: string;
  @Column('uuid')
  importedById: string;
  @Column('uuid')
  evidenceId: string;
  @ManyToOne(() => DisputeEvidence, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'evidenceId' })
  evidence: DisputeEvidence;
}
