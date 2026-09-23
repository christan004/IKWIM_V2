import type { ReactElement } from 'react'
import { ErrorBoundary } from '@/components/error-boundary'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/protected-route'
import { AppLayout } from '@/layouts/app-layout'
import { LoginPage } from '@/features/auth/pages/login-page'
import { ForgotPasswordPage } from '@/features/auth/pages/forgot-password-page'
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { ProfilePage } from '@/pages/profile-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { ModulePlaceholderPage } from '@/pages/module-placeholder-page'
import { ModulesPage } from '@/features/modules/pages/modules-page'
import { RolesPage } from '@/features/roles/pages/roles-page'
import { UsersPage } from '@/features/users/pages/users-page'
import { UnitsPage } from '@/features/units/pages/units-page'
import { ItemsPage } from '@/features/items/pages/items-page'
import { SupplierTypesPage } from '@/features/suppliers/pages/supplier-types-page'
import { ClearanceAgentsPage } from '@/features/clearance-agents/pages/clearance-agents-page'
import { AuthorizersPage } from '@/features/authorizers/pages/authorizers-page'
import { CompanyAccountsPage } from '@/features/company-accounts/pages/company-accounts-page'
import { ClientsPage } from '@/features/clients/pages/clients-page'
import { ClientWalletsPage } from '@/features/client-wallets/pages/client-wallets-page'
import { DiscountsPage } from '@/features/discounts/pages/discounts-page'
import { LoadingOrdersPage } from '@/features/loading-orders/pages/loading-orders-page'
import { SuppliersPage } from '@/features/suppliers/pages/suppliers-page'
import { OrderPlansPage } from '@/features/orders/pages/order-plans-page'
import { OrdersPage } from '@/features/orders/pages/orders-page'
import { DeportsPage } from '@/features/deports/pages/deports-page'
import { TransportersPage } from '@/features/transporters/pages/transporters-page'
import { VehiclesPage } from '@/features/vehicles/pages/vehicles-page'
import { DriversPage } from '@/features/drivers/pages/drivers-page'
import { CargoPage } from '@/features/cargo/pages/cargo-page'
import { OrderReportPage } from '@/features/reports/pages/order-report-page'
import { CentralStockReportPage } from '@/features/reports/pages/central-stock-report-page'
import { StockPage } from '@/features/stock/pages/stock-page'
import { NominationsPage } from '@/features/nominations/pages/nominations-page'
import { PfiPage } from '@/features/pfi/pages/pfi-page'
import { T1ValidationPage } from '@/features/t1-validation/pages/t1-validation-page'
import { CentralStockPage } from '@/features/central-stock/pages/central-stock-page'
import { PssPage } from '@/features/pss/pages/pss-page'
import { StockoutOrdersPage } from '@/features/stockout-orders/pages/stockout-orders-page'
import { PumpsPage } from '@/features/pumps/pages/pumps-page'
import { DisplaysPage } from '@/features/displays/pages/displays-page'
import { CuvesPage } from '@/features/cuves/pages/cuves-page'
import { NozzlesPage } from '@/features/nozzles/pages/nozzles-page'
import { registeredRoutes } from '@/lib/module-registry'

/**
 * Module routes that have a real screen. Anything in the registry but absent
 * here falls back to the placeholder — so building a page means adding one line
 * here, and the sidebar link starts working immediately.
 */
const REAL_PAGES: Record<string, ReactElement> = {
  '/modules': <ModulesPage />,
  '/roles': <RolesPage />,
  '/users': <UsersPage />,
  '/units': <UnitsPage />,
  '/items': <ItemsPage />,
  '/suppliers/types': <SupplierTypesPage />,
  '/clearance-agents': <ClearanceAgentsPage />,
  '/authorizers': <AuthorizersPage />,
  '/company-accounts': <CompanyAccountsPage />,
  '/clients': <ClientsPage />,
  '/client-wallets': <ClientWalletsPage />,
  '/discounts': <DiscountsPage />,
  '/loading-orders': <LoadingOrdersPage />,
  '/suppliers': <SuppliersPage />,
  '/orders/plans': <OrderPlansPage />,
  '/orders': <OrdersPage />,
  '/deports': <DeportsPage />,
  '/transporters': <TransportersPage />,
  '/vehicles': <VehiclesPage />,
  '/drivers': <DriversPage />,
  '/cargo': <CargoPage />,
  '/reports/orders': <OrderReportPage />,
  '/reports/central-stock': <CentralStockReportPage />,
  '/stock': <StockPage />,
  '/nominations': <NominationsPage />,
  '/pfi': <PfiPage />,
  '/t1-validation': <T1ValidationPage />,
  '/central-stock': <CentralStockPage />,
  '/pss': <PssPage />,
  '/stockout-orders': <StockoutOrdersPage />,
  '/pumps': <PumpsPage />,
  '/displays': <DisplaysPage />,
  '/cuves': <CuvesPage />,
  '/nozzles': <NozzlesPage />,
}

function App() {
  return (
    /*
     * Wraps every route so a thrown render shows the error instead of unmounting
     * the tree and leaving a blank page — which reads as a permissions problem
     * or an empty list, and is the hardest failure to diagnose from a screenshot.
     */
    <ErrorBoundary>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />

            {/*
              Generated from the module registry so every sidebar link resolves.
              When a real page is built, add it to REAL_PAGES below rather than
              declaring a second <Route> for the same path — React Router matches
              on specificity, not source order, so duplicates would be ambiguous.
            */}
            {registeredRoutes()
              .filter(({ path }) => !REAL_PAGES[path])
              .map(({ code, path, title }) => (
                <Route key={code} path={path} element={<ModulePlaceholderPage title={title} />} />
              ))}

            {Object.entries(REAL_PAGES).map(([path, element]) => (
              <Route key={path} path={path} element={element} />
            ))}
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
