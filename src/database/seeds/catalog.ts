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

export const SEED_USER_ADDRESSES: {
  accountKey: (typeof SEED_ACCOUNTS)[number]['key'];
  recipientName: string;
  phone: string;
  addressLine1: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  label?: string;
  isDefault: boolean;
}[] = [
  {
    accountKey: 'admin',
    recipientName: 'Seed Admin',
    phone: '0901112233',
    addressLine1: '1 Hoàng Diệu',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00004',
    wardName: 'Phường Ba Đình',
    label: 'Trụ sở',
    isDefault: true,
  },
  {
    accountKey: 'admin',
    recipientName: 'Seed Admin (Lotte Center)',
    phone: '0901112233',
    addressLine1: '54 Liễu Giai, Lotte Center',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00008',
    wardName: 'Phường Ngọc Hà',
    label: 'Văn phòng',
    isDefault: false,
  },
  {
    accountKey: 'admin',
    recipientName: 'Seed Admin (Nhà riêng)',
    phone: '0901112233',
    addressLine1: '88 Phố Huế',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00082',
    wardName: 'Phường Cửa Nam',
    label: 'Nhà riêng',
    isDefault: false,
  },
  {
    accountKey: 'admin',
    recipientName: 'Seed Admin (Chi nhánh HCM)',
    phone: '0901112233',
    addressLine1: '65 Lê Lợi, Saigon Centre',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26743',
    wardName: 'Phường Bến Thành',
    label: 'Chi nhánh',
    isDefault: false,
  },
  {
    accountKey: 'buyer',
    recipientName: 'Minh Anh',
    phone: '0901234567',
    addressLine1: '123 Nguyễn Huệ',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26743',
    wardName: 'Phường Bến Thành',
    label: 'Nhà riêng',
    isDefault: true,
  },
  {
    accountKey: 'buyer',
    recipientName: 'Minh Anh (Văn phòng)',
    phone: '0901234567',
    addressLine1: '45 Lê Duẩn, Deutsches Haus',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26740',
    wardName: 'Phường Sài Gòn',
    label: 'Văn phòng',
    isDefault: false,
  },
  {
    accountKey: 'buyer',
    recipientName: 'Minh Anh (Nhà bố mẹ)',
    phone: '0901234567',
    addressLine1: '28 Xuân Diệu, Biệt thự Tây Hồ',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00103',
    wardName: 'Phường Tây Hồ',
    label: 'Gia đình',
    isDefault: false,
  },
  {
    accountKey: 'buyer',
    recipientName: 'Minh Anh (Căn hộ)',
    phone: '0901234567',
    addressLine1: 'Tòa nhà Landmark 81, 720A Điện Biên Phủ',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26740',
    wardName: 'Phường Sài Gòn',
    label: 'Căn hộ',
    isDefault: false,
  },
  {
    accountKey: 'shop-owner-1',
    recipientName: 'Linh Nguyễn',
    phone: '0902223344',
    addressLine1: '158 Đồng Khởi',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26743',
    wardName: 'Phường Bến Thành',
    label: 'Cửa hàng',
    isDefault: true,
  },
  {
    accountKey: 'shop-owner-2',
    recipientName: 'Tuấn Trần',
    phone: '0903334455',
    addressLine1: '88 Hai Bà Trưng',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26740',
    wardName: 'Phường Sài Gòn',
    label: 'Cửa hàng',
    isDefault: true,
  },
  {
    accountKey: 'shop-owner-3',
    recipientName: 'Hà Phạm',
    phone: '0904445566',
    addressLine1: '24 Tràng Tiền',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00082',
    wardName: 'Phường Cửa Nam',
    label: 'Cửa hàng',
    isDefault: true,
  },
  {
    accountKey: 'seller-1',
    recipientName: 'Mai Lê',
    phone: '0905556677',
    addressLine1: '72 Lê Thánh Tôn',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26743',
    wardName: 'Phường Bến Thành',
    label: 'Nhà riêng',
    isDefault: true,
  },
  {
    accountKey: 'seller-2',
    recipientName: 'An Võ',
    phone: '0906667788',
    addressLine1: '12 Tràng Thi',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00082',
    wardName: 'Phường Cửa Nam',
    label: 'Nhà riêng',
    isDefault: true,
  },
];

export const SEED_PICKUP_LOCATIONS: {
  shopIndex: number;
  contactName: string;
  phone: string;
  addressLine1: string;
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
}[] = [
  {
    shopIndex: 0,
    contactName: 'Kho Second Story (Linh Nguyễn)',
    phone: '0909876541',
    addressLine1: '158 Đồng Khởi, Bến Nghé, Quận 1',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26743',
    wardName: 'Phường Bến Thành',
  },
  {
    shopIndex: 1,
    contactName: 'Kho The Vintage Edit (Tuấn Trần)',
    phone: '0909876542',
    addressLine1: '88 Hai Bà Trưng, Bến Nghé, Quận 1',
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    wardCode: '26740',
    wardName: 'Phường Sài Gòn',
  },
  {
    shopIndex: 2,
    contactName: 'Kho Little Wardrobe (Hà Phạm)',
    phone: '0909876543',
    addressLine1: '24 Tràng Tiền, Hoàn Kiếm',
    provinceCode: '01',
    provinceName: 'Thành phố Hà Nội',
    wardCode: '00082',
    wardName: 'Phường Cửa Nam',
  },
];
