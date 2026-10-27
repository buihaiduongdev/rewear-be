import type { MeasurementKey } from '@/common/schemas/measurements.schema';

export const SEED_CATEGORIES: {
  name: string;
  slug: string;
  requiredMeasurements: MeasurementKey[];
  title: string;
  photo: string;
  sizeBytes: number;
}[] = [
  {
    name: 'Tops',
    slug: 'tops',
    requiredMeasurements: ['chest', 'length'],
    title: 'Cotton knit sweater',
    photo: 'photo-1434389677669-e08b4cac3105',
    sizeBytes: 166955,
  },
  {
    name: 'Bottoms',
    slug: 'bottoms',
    requiredMeasurements: ['waist', 'inseam'],
    title: 'Straight-leg denim jeans',
    photo: 'photo-1542272604-787c3835535d',
    sizeBytes: 56376,
  },
  {
    name: 'Dresses',
    slug: 'dresses',
    requiredMeasurements: ['chest', 'waist', 'length'],
    title: 'Floral midi dress',
    photo: 'photo-1515372039744-b8f02a3ae446',
    sizeBytes: 111880,
  },
  {
    name: 'Outerwear',
    slug: 'outerwear',
    requiredMeasurements: ['chest', 'shoulder', 'length'],
    title: 'Vintage leather jacket',
    photo: 'photo-1551028719-00167b16eac5',
    sizeBytes: 163062,
  },
  {
    name: 'Footwear',
    slug: 'footwear',
    requiredMeasurements: [],
    title: 'Everyday sneakers',
    photo: 'photo-1549298916-b41d501d3772',
    sizeBytes: 109821,
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    requiredMeasurements: [],
    title: 'Everyday backpack',
    photo: 'photo-1553062407-98eeb64c6a62',
    sizeBytes: 71699,
  },
];

export const SEED_SHOPS = [
  {
    name: 'Second Story',
    description: 'Easy everyday pieces, selected for their next chapter.',
  },
  {
    name: 'The Vintage Edit',
    description: 'Pre-loved denim, outerwear and wardrobe favourites.',
  },
  {
    name: 'Little Wardrobe',
    description: 'Small finds with plenty of life left in them.',
  },
];

export const SEED_ACCOUNTS = [
  { key: 'admin', fullName: 'Seed Admin' },
  { key: 'buyer', fullName: 'Minh Anh' },
  { key: 'shop-owner-1', fullName: 'Linh Nguyễn' },
  { key: 'shop-owner-2', fullName: 'Tuấn Trần' },
  { key: 'shop-owner-3', fullName: 'Hà Phạm' },
  { key: 'seller-1', fullName: 'Mai Lê' },
  { key: 'seller-2', fullName: 'An Võ' },
] as const;

export const DEFAULT_SEED_PASSWORD = 'RewearSeed123!';
