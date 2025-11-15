import { useState, useEffect } from "react";
import type { ApartmentDetailsDTO } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ApartmentChargesTab from "./apartment-charges-tab";
import ApartmentSettingsTab from "./apartment-settings-tab";

type ApartmentTabId = 'charges' | 'protocol-move-in' | 'protocol-move-out' | 'settings';

interface ApartmentDetailsViewProps {
  apartmentId: string;
  initialApartment: ApartmentDetailsDTO;
  role: 'owner' | 'tenant';
}

// Mapowanie hash URL na ID zakładki
const hashToTab: Record<string, ApartmentTabId> = {
  '': 'charges',
  '#charges': 'charges',
  '#protokol-odbioru': 'protocol-move-in',
  '#protokol-zwrotu': 'protocol-move-out',
  '#ustawienia': 'settings',
};

// Mapowanie ID zakładki na hash URL
const tabToHash: Record<ApartmentTabId, string> = {
  'charges': '',
  'protocol-move-in': '#protokol-odbioru',
  'protocol-move-out': '#protokol-zwrotu',
  'settings': '#ustawienia',
};

export default function ApartmentDetailsView({
  apartmentId,
  initialApartment,
  role,
}: ApartmentDetailsViewProps) {
  // Inicjalizacja z domyślną zakładką 'charges' - spójna między SSR i klientem
  const [activeTab, setActiveTab] = useState<ApartmentTabId>('charges');
  const [isHydrated, setIsHydrated] = useState(false);

  // Odczytaj hash z URL po hydration (tylko raz)
  useEffect(() => {
    const hash = window.location.hash;
    const tab = hashToTab[hash];

    if (tab && (tab !== 'settings' || role === 'owner')) {
      setActiveTab(tab);
    }

    setIsHydrated(true);
  }, [role]);

  // Synchronizacja hash w URL przy zmianie zakładki (tylko po hydration)
  useEffect(() => {
    if (!isHydrated) return;

    const hash = tabToHash[activeTab];

    // Aktualizacja hash bez przeładowania strony
    if (hash) {
      window.history.replaceState(null, '', hash);
    } else {
      // Usunięcie hash dla zakładki domyślnej
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [activeTab, isHydrated]);

  // Nasłuchiwanie zmian hash w URL (np. przycisk wstecz/do przodu)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const tab = hashToTab[hash];

      if (tab && (tab !== 'settings' || role === 'owner')) {
        setActiveTab(tab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [role]);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ApartmentTabId)}>
        <TabsList className="w-full overflow-x-auto justify-start">
          <TabsTrigger value="charges">Opłaty</TabsTrigger>
          <TabsTrigger value="protocol-move-in">Protokół Odbioru</TabsTrigger>
          <TabsTrigger value="protocol-move-out">Protokół Zwrotu</TabsTrigger>
          {role === 'owner' && (
            <TabsTrigger value="settings">Ustawienia</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="charges" className="mt-6">
          <ApartmentChargesTab apartmentId={apartmentId} role={role} />
        </TabsContent>

        <TabsContent value="protocol-move-in" className="mt-6">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
            <p className="text-neutral-600 dark:text-neutral-400">
              Protokół Odbioru - w trakcie implementacji
            </p>
          </div>
        </TabsContent>

        <TabsContent value="protocol-move-out" className="mt-6">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
            <p className="text-neutral-600 dark:text-neutral-400">
              Protokół Zwrotu - w trakcie implementacji
            </p>
          </div>
        </TabsContent>

        {role === 'owner' && (
          <TabsContent value="settings" className="mt-6">
            <ApartmentSettingsTab apartment={initialApartment} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
