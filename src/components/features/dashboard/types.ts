/**
 * Typy ViewModelowe dla widoku Dashboard właściciela i lokatora
 */

import type { LucideIcon } from 'lucide-react';

/**
 * ViewModel pojedynczej karty mieszkania na dashboardzie właściciela
 */
export type OwnerDashboardApartmentCardVM = {
  /** Identyfikator mieszkania */
  id: string;
  /** Nazwa mieszkania */
  name: string;
  /** Adres mieszkania */
  address: string;
  /** Status lokatora gotowy do wyświetlenia */
  tenantStatusLabel: string;
  /** Tekst salda do wyświetlenia */
  balanceLabel: string;
  /** Czy jest jakakolwiek przeterminowana kwota */
  isOverdue: boolean;
  /** Ścieżka do szczegółów mieszkania */
  href: string;
};

/**
 * ViewModel całego widoku dashboardu właściciela
 */
export type OwnerDashboardViewModel = {
  /** Lista kart mieszkań do wyświetlenia */
  apartments: OwnerDashboardApartmentCardVM[];
  /** Czy są jakiekolwiek mieszkania */
  hasApartments: boolean;
};

// =============================================================================
// TENANT DASHBOARD VIEW MODELS
// =============================================================================

/**
 * ViewModel pojedynczej karty nawigacyjnej na dashboardzie lokatora
 */
export type TenantDashboardNavCardVM = {
  /** Tytuł karty (np. "Lista opłat", "Protokół Odbioru") */
  title: string;
  /** Krótki opis karty */
  description: string;
  /** Docelowy URL */
  href: string;
  /** Ikona karty z lucide-react */
  icon: LucideIcon;
};

/**
 * ViewModel całego widoku dashboardu lokatora
 */
export type TenantDashboardViewModel = {
  /** Identyfikator mieszkania */
  apartmentId: string;
  /** Nazwa mieszkania */
  apartmentName: string;
  /** Adres mieszkania */
  apartmentAddress: string;
  /** Imię i nazwisko właściciela */
  ownerName: string;
  /** Surowa kwota do zapłaty */
  totalDue: number;
  /** Surowa kwota po terminie */
  totalOverdue: number;
  /** Sformatowany tekst kwoty do zapłaty (np. "Łącznie do zapłaty: 2 000 zł") */
  totalDueLabel: string;
  /** Czy jest jakakolwiek kwota po terminie */
  hasOverdue: boolean;
  /** Lista kart nawigacyjnych */
  navCards: TenantDashboardNavCardVM[];
};

