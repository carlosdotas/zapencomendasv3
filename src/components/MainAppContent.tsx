import React, { useEffect, useState, useCallback } from 'react';
import { useMapStore } from '../context/MapContext';
import { FullscreenMap } from './map/FullscreenMap';
import { MonitorMapLayer } from './map/MonitorMapLayer';
import { TopControls } from './navigation/TopControls';
import { DriverEarningsBar } from './driver/DriverEarningsBar';
import { RouteDispatchManager } from './driver/RouteDispatchManager';
import { BottomSearchBar } from './navigation/BottomSearchBar';
import { LocationButton } from './navigation/LocationButton';
import { SideMenuDrawer } from './sidebar/SideMenuDrawer';
import { UserProfilePage } from './profile/UserProfilePage';
import { PlaceDetailCard } from './place/PlaceDetailCard';
import { NavigationStatus } from './navigation/NavigationStatus';
import { DriverDetailCard } from './driver/DriverDetailCard';
import { LoginModal } from './auth/LoginModal';
import { RegisterModal } from './auth/RegisterModal';
import { AdminSettingsPage } from './admin/AdminSettingsPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { DriverScreenOverlay } from './driver/DriverScreenOverlay';
import { UrgentOrderOfferOverlay } from './driver/UrgentOrderOfferOverlay';
import { NewOrderModal } from './order/NewOrderModal';
import { SetCustomerLocationModal } from './customer/SetCustomerLocationModal';
import { CustomerSelectorDrawer } from './customer/CustomerSelectorDrawer';
import { CustomerFormFullScreen } from './customer/CustomerFormFullScreen';
import { OrdersListModal } from './order/OrdersListModal';
import { FinancialModalFullScreen } from './financial/FinancialModalFullScreen';
import { CalendarFilterModal } from './navigation/CalendarFilterModal';
import { Customer, AgendaContact } from '../types/customer';
import { Place } from '../types/map';
import { FullScreenPhotoViewer } from './place/FullScreenPhotoViewer';
import { OfflineIndicator } from './pwa/OfflineIndicator';
import { UpdateNotification } from './pwa/UpdateNotification';
import { GpsStatusBanner } from './map/GpsStatusBanner';
import { useBackButton } from '../hooks/useBackButton';

export const MainAppContent: React.FC = () => {
  const { 
    isAuthenticated,
    isLoginModalOpen, 
    setIsLoginModalOpen,
    isRegisterModalOpen,
    setIsRegisterModalOpen,
    loginWithAccount,
    currentRole,
    viewingPhotoUrl,
    closePhotoViewer,
    isAdminUsersOpen,
    setIsAdminUsersOpen,
    isAdminSettingsOpen,
    setIsAdminSettingsOpen,
    isProfileOpen,
    setIsProfileOpen,
    isSidebarOpen,
    setIsSidebarOpen,
    selectedDriver,
    setSelectedDriver,
    selectedPlace,
    setSelectedPlace,
    activeRoute,
    clearActiveRoute,
    isCustomerListOpen,
    setIsCustomerListOpen,
    closeCustomerList,
    persistCustomer,
    mapInstance,
    isCalendarModalOpen,
    closeCalendarModal,
    isOrdersModalOpen,
    closeOrdersModal,
    isFinancialModalOpen,
    closeFinancialModal,
    financialInitialTab
  } = useMapStore();

  const [isCustomerRegOpen, setIsCustomerRegOpen] = useState(false);
  const [customerRegInitialData, setCustomerRegInitialData] = useState<Partial<Customer> | AgendaContact | null>(null);
  const [settingsStartPage, setSettingsStartPage] = useState<'companies' | null>(null);

  const openSettings = useCallback((page: 'companies' | null) => {
    setSettingsStartPage(page);
    setIsAdminSettingsOpen(true);
  }, [setIsAdminSettingsOpen]);

  const handleOpenRegistrationFromList = useCallback((initialData?: Partial<Customer> | AgendaContact) => {
    closeCustomerList();
    setCustomerRegInitialData(initialData || null);
    setIsCustomerRegOpen(true);
  }, [closeCustomerList]);

  const handleSaveCustomerFromList = useCallback(async (newCust: Customer) => {
    const savedCustomer = await persistCustomer(newCust);
    if (!savedCustomer) {
      window.alert('Não foi possível salvar o endereço do cliente no banco de dados.');
      return;
    }

    setIsCustomerRegOpen(false);
    if (
      savedCustomer.coordinates &&
      typeof savedCustomer.coordinates.lat === 'number' &&
      typeof savedCustomer.coordinates.lng === 'number' &&
      (savedCustomer.coordinates.lat !== 0 || savedCustomer.coordinates.lng !== 0)
    ) {
      if (mapInstance) {
        mapInstance.flyTo([savedCustomer.coordinates.lat, savedCustomer.coordinates.lng], 17, { animate: true, duration: 1.2 });
      }
      const rawName = savedCustomer.fullName || 'Cliente';
      const placeName = rawName.toLowerCase().startsWith('local de ') ? rawName : `Local de ${rawName}`;
      const newPlace: Place = {
        id: `cliente-${savedCustomer.id}`,
        name: placeName,
        address: savedCustomer.address || 'Goiânia - GO',
        category: 'Cliente',
        coordinates: savedCustomer.coordinates,
        customerName: savedCustomer.fullName,
        customerPhone: savedCustomer.phone,
        customerId: savedCustomer.id,
        customerAddress: savedCustomer.address,
        customerCoordinates: savedCustomer.coordinates
      };
      setSelectedPlace(newPlace);
    } else {
      setIsCustomerListOpen(true);
    }
  }, [mapInstance, setSelectedPlace, setIsCustomerListOpen, persistCustomer]);

  // Garante que, caso o usuário não esteja autenticado, a tela de login ou cadastro esteja sempre ativa
  useEffect(() => {
    if (!isAuthenticated && !isLoginModalOpen && !isRegisterModalOpen) {
      setIsLoginModalOpen(true);
    }
  }, [isAuthenticated, isLoginModalOpen, isRegisterModalOpen, setIsLoginModalOpen]);

  // ========================================================
  // INTERCEPTADORES DO BOTÃO VOLTAR DO ANDROID (HARDWARE / GESTO / ESC)
  // Hierarquia inteligente: fecha da janela mais profunda para a tela principal
  // ========================================================
  
  // 1. Visualizador de Foto em Tela Cheia (Prioridade máxima: 90)
  useBackButton('full-screen-photo-viewer', !!viewingPhotoUrl, () => {
    closePhotoViewer();
  }, 90);

  // 1.5. Cadastro de Cliente a partir da Lista (Prioridade: 85)
  useBackButton('customer-reg-form-main', isCustomerRegOpen, () => {
    setIsCustomerRegOpen(false);
    setIsCustomerListOpen(true);
  }, 85);

  // 1.6. Gaveta da Lista de Clientes (Prioridade: 80)
  useBackButton('customer-list-drawer-main', isCustomerListOpen, () => {
    closeCustomerList();
  }, 80);

  // 1.7. Janela de Pedidos & Filtros (Prioridade: 78)
  useBackButton('orders-list-modal-main', isOrdersModalOpen, () => {
    closeOrdersModal();
  }, 78);

  // 2. Páginas Administrativas e Perfil do Usuário (Prioridade: 70)
  useBackButton('admin-users-page', isAdminUsersOpen, () => {
    setIsAdminUsersOpen(false);
  }, 70);

  useBackButton('admin-settings-page', isAdminSettingsOpen, () => {
    setIsAdminSettingsOpen(false);
  }, 70);

  useBackButton('user-profile-page', isProfileOpen, () => {
    setIsProfileOpen(false);
  }, 70);

  // 3. Menu Lateral Retrátil (Prioridade: 60)
  useBackButton('side-menu-drawer', isSidebarOpen, () => {
    setIsSidebarOpen(false);
  }, 60);

  // 4. Modal de Registro de Motorista (Prioridade: 55)
  useBackButton('register-modal', isRegisterModalOpen, () => {
    setIsRegisterModalOpen(false);
    if (!isAuthenticated) setIsLoginModalOpen(true);
  }, 55);

  // 5. Card de Detalhes do Motorista no Mapa (Prioridade: 50)
  useBackButton('driver-detail-card', !!selectedDriver, () => {
    setSelectedDriver(null);
  }, 50);

  // 6. Card de Detalhes da Encomenda/Marcador no Mapa (Prioridade: 45)
  useBackButton('place-detail-card', !!selectedPlace, () => {
    setSelectedPlace(null);
  }, 45);

  // 7. Rota Ativa no Mapa (Prioridade: 30) - Cancela traçado e retorna ao mapa limpo
  useBackButton('active-route', !!activeRoute, () => {
    clearActiveRoute();
  }, 30);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100 font-sans select-none antialiased">
      {/* 1. Mapa em Tela Cheia: visível atrás, mas sem qualquer funcionalidade caso não esteja logado */}
      <div className={`w-full h-full transition-all duration-300 ${!isAuthenticated ? 'pointer-events-none select-none blur-[1.5px] opacity-70 filter' : ''}`}>
        <FullscreenMap />
      </div>

      {isAuthenticated && currentRole === 'terminal' && <MonitorMapLayer />}

      {/* Camada protetora semitransparente caso não autenticado */}
      {!isAuthenticated && (
        <div className="absolute inset-0 z-40 bg-slate-900/40 pointer-events-auto backdrop-blur-[1px]" />
      )}

      {/* 2. Controles do Sistema (TopControls, Busca, Banners, Gaveta) - Acessíveis APENAS com autenticação ativa */}
      <div className={`transition-opacity duration-200 ${!isAuthenticated ? 'pointer-events-none opacity-0 invisible' : 'opacity-100'}`}>
        {/* Indicador de Status Offline / Reconexão */}
        <OfflineIndicator />

        {/* Alerta inteligente de status/permissão de GPS */}
        <GpsStatusBanner />

        {/* Topo: Controles superiores (Menu, Notificações, Perfil) */}
        <TopControls />

        {/* Resumo diário do motorista (aceitos, coletados e ganhos) */}
        <DriverEarningsBar />

        <RouteDispatchManager />

        {/* Botão Flutuante Inferior Direito para Filtros e Centralizar Localização */}
        {currentRole !== 'terminal' && <LocationButton />}

        {/* Busca Flutuante embaixo */}
        {currentRole !== 'terminal' && <BottomSearchBar />}

        {/* Diálogo de Detalhes da Entrega / Marcador */}
        <PlaceDetailCard />

        <NavigationStatus />

        {/* Card de Detalhes do Motorista */}
        <DriverDetailCard />

        {/* Overlay e Tela de Bloqueio do Motorista (Chavinha estilo Uber para rodar) */}
        <DriverScreenOverlay />
        <UrgentOrderOfferOverlay />

        {/* Menu Lateral Retrátil */}
        <SideMenuDrawer onOpenCompanies={() => openSettings('companies')} onOpenSettings={() => openSettings(null)} />

        {/* Página Inteira de Perfil do Usuário */}
        <UserProfilePage />

        {/* Página Inteira de Configurações do Sistema */}
        <AdminSettingsPage initialSubpage={settingsStartPage} />

        {/* Página Inteira de Gestão de Usuários */}
        <AdminUsersPage />

        {/* Formulário Completo de Nova Encomenda */}
        <NewOrderModal />

        {/* Modal de Filtro por Calendário / Datas */}
        <CalendarFilterModal
          isOpen={isCalendarModalOpen}
          onClose={closeCalendarModal}
        />

        {/* Janela Completa de Pedidos e Filtros */}
        {isOrdersModalOpen && (
          <OrdersListModal
            isOpen={isOrdersModalOpen}
            onClose={closeOrdersModal}
          />
        )}

        {/* Janela Completa da Área Financeira (Contas a Pagar e Contas a Receber em Tela Cheia) */}
        {isFinancialModalOpen && (
          <FinancialModalFullScreen
            isOpen={isFinancialModalOpen}
            onClose={closeFinancialModal}
            initialTab={financialInitialTab}
          />
        )}

        {/* Modal de Busca e Definição de Localização do Cliente */}
        <SetCustomerLocationModal />

        {/* Gaveta da Lista de Clientes (Banco de Dados + Agenda Telefônica) */}
        {isCustomerListOpen && (
          <CustomerSelectorDrawer
            isOpen={isCustomerListOpen}
            onClose={closeCustomerList}
            targetField="customer"
            onSelectCustomer={handleOpenRegistrationFromList}
            onOpenRegistration={handleOpenRegistrationFromList}
            canDeleteCustomer={currentRole !== 'motorista'}
          />
        )}

        {/* Formulário Completo de Cadastro de Cliente aberto a partir da Lista */}
        {isCustomerRegOpen && (
          <CustomerFormFullScreen
            isOpen={isCustomerRegOpen}
            onClose={() => {
              setIsCustomerRegOpen(false);
              setIsCustomerListOpen(true);
            }}
            onSaveCustomer={handleSaveCustomerFromList}
            initialData={customerRegInitialData}
            targetFieldTitle="Cliente"
          />
        )}

        {/* Visualizador de Foto da Encomenda Grande em Tela Cheia */}
        <FullScreenPhotoViewer />
      </div>

      {/* 3. Modal de Login Obrigatório: Exibido sempre que não autenticado e não estiver na tela de cadastro */}
      <LoginModal
        isOpen={(!isAuthenticated && !isRegisterModalOpen) || isLoginModalOpen}
        onLoginSuccess={loginWithAccount}
      />

      {/* 4. Tela Completa de Cadastro de Motorista */}
      <RegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => {
          if (!isAuthenticated) {
            setIsRegisterModalOpen(false);
            setIsLoginModalOpen(true);
          } else {
            setIsRegisterModalOpen(false);
          }
        }}
        onSuccess={(acc) => {
          setIsRegisterModalOpen(false);
          loginWithAccount(acc);
        }}
        onSwitchToLogin={() => {
          setIsRegisterModalOpen(false);
          setIsLoginModalOpen(true);
        }}
        canDismiss={isAuthenticated}
      />

      {/* 5. Notificação Inteligente de Nova Versão Pronta para Atualização */}
      <UpdateNotification />
    </main>
  );
};
