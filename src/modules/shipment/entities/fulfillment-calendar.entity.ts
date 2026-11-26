import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('fulfillment_calendars')
export class FulfillmentCalendar {
  @PrimaryColumn('integer')
  year: number;

  @Column('jsonb')
  closedDates: string[];

  @Column('text')
  source: string;

  @Column('uuid')
  approvedBy: string;
}
