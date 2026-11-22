import type { MeasurementKey } from '@/common/schemas/measurements.schema';

export const SEED_CATEGORIES: {
  name: string;
  slug: string;
  requiredMeasurements: MeasurementKey[];
  title: string;
  photo: string;
  sizeBytes: number;
  description: string;
  color: string;
  size: string;
  measurements: Partial<Record<MeasurementKey, number>>;
}[] = [
  {
    name: 'Tops',
    slug: 'tops',
    requiredMeasurements: ['chest', 'length'],
    title: 'Cream open-knit poncho',
    description: 'A lightweight open-knit poncho in a soft cream shade, finished with a fringed hem. Easy to layer over a simple top for cooler evenings. Pre-loved and ready for another wardrobe.',
    color: 'Cream',
    size: 'One size',
    measurements: { chest: 110, length: 65 },
    photo: 'photo-1434389677669-e08b4cac3105',
    sizeBytes: 166925,
  },
  {
    name: 'Bottoms',
    slug: 'bottoms',
    requiredMeasurements: ['waist', 'inseam'],
    title: 'Classic denim jeans',
    description: 'Everyday denim with a timeless straight-leg silhouette and a classic five-pocket look. A versatile secondhand staple that pairs easily with shirts, knits and jackets.',
    color: 'Blue',
    size: 'M',
    measurements: { waist: 76, hip: 98, inseam: 74 },
    photo: 'photo-1542272604-787c3835535d',
    sizeBytes: 56365,
  },
  {
    name: 'Dresses',
    slug: 'dresses',
    requiredMeasurements: ['chest', 'waist', 'length'],
    title: 'Blue floral summer dress',
    description: 'A blue floral dress with a relaxed summer feel. Light, easy to style and suitable for casual days. Please compare the measurements with a favourite dress before purchasing.',
    color: 'Blue',
    size: 'M',
    measurements: { chest: 92, waist: 76, length: 98 },
    photo: 'photo-1760097679488-f808c6aca11d',
    sizeBytes: 97456,
  },
  {
    name: 'Outerwear',
    slug: 'outerwear',
    requiredMeasurements: ['chest', 'shoulder', 'length'],
    title: 'Black biker jacket',
    description: 'A black biker-style jacket with a notched collar and zip details. A statement layer for everyday outfits, offered pre-loved for its next owner.',
    color: 'Black',
    size: 'M',
    measurements: { chest: 96, shoulder: 42, sleeve: 58, length: 60 },
    photo: 'photo-1551028719-00167b16eac5',
    sizeBytes: 163062,
  },
  {
    name: 'Footwear',
    slug: 'footwear',
    requiredMeasurements: [],
    title: 'Brown lace-up sneakers',
    description: 'Brown low-top lace-up sneakers with a contrasting white sole. A comfortable-looking casual style for everyday outfits. Check the listed size before purchasing.',
    color: 'Brown',
    size: 'EU 40',
    measurements: {},
    photo: 'photo-1549298916-b41d501d3772',
    sizeBytes: 109818,
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    requiredMeasurements: [],
    title: 'Navy everyday backpack',
    description: 'A navy backpack with a front zip pocket and top handle. Its simple shape makes it a practical option for everyday essentials, commuting or short trips.',
    color: 'Navy',
    size: 'One size',
    measurements: {},
    photo: 'photo-1553062407-98eeb64c6a62',
    sizeBytes: 71738,
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
