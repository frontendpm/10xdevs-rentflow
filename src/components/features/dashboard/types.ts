/**
 * Typy ViewModelowe dla widoku Dashboard właściciela
 */

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

