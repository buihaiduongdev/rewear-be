import type {
  IDENTITY_DOCUMENT_SLOT,
  IDENTITY_DOCUMENT_TYPE,
  SHOP_APPLICATION_STATE,
} from '../constants/shop-application.constant';

export type ShopApplicationState =
  (typeof SHOP_APPLICATION_STATE)[keyof typeof SHOP_APPLICATION_STATE];
export type IdentityDocumentType =
  (typeof IDENTITY_DOCUMENT_TYPE)[keyof typeof IDENTITY_DOCUMENT_TYPE];
export type IdentityDocumentSlot =
  (typeof IDENTITY_DOCUMENT_SLOT)[keyof typeof IDENTITY_DOCUMENT_SLOT];
export type ApplicantIdentity = {
  documentType: IdentityDocumentType;
  documentNumber: string;
  issuingCountry: string;
  fullName: string;
  birthDate: string;
  expiresOn: string;
};
export type ShopApplicationSnapshot = {
  identity: ApplicantIdentity;
  shop: {
    id: string;
    name: string;
    description: string | null;
    logoUrl: string;
  };
  pickup: {
    id: string;
    contactName: string;
    phone: string;
    addressLine1: string;
    countryCode: string;
    provinceCode: string;
    provinceName: string;
    wardCode: string;
    wardName: string;
  };
  bank: {
    id: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    confirmedBy: string;
  };
  documents: { id: string; slot: IdentityDocumentSlot }[];
};
