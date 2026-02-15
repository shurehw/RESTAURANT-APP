/**
 * Role-Based Navigation Permissions
 * Defines which nav items are visible for each role
 */

export type UserRole = 'gm' | 'exec_chef' | 'sous_chef' | 'manager' | 'agm' | 'director' | 'owner';

export interface NavPermissions {
  // COGS Section
  orders: boolean;
  invoices: boolean;
  reconciliation: boolean;
  vendors: boolean;
  products: boolean;
  recipes: boolean;
  inventory: boolean;

  // Sales Section
  forecasts: boolean;
  nightlyReport: boolean;
  venueHealth: boolean;
  preshift: boolean;
  actionCenter: boolean;
  attestations: boolean;

  // Labor Section
  laborBriefing: boolean;
  laborRequirements: boolean;
  laborSchedule: boolean;

  // Standalone
  aiAssistant: boolean;
  budget: boolean;

  // Admin Section
  orgSettings: boolean;
  compSettings: boolean;
  procurementSettings: boolean;

  // Optional Modules
  entertainment: boolean; // h.wood only
}

/**
 * Get navigation permissions for a user role
 */
export function getNavPermissions(role: UserRole): NavPermissions {
  switch (role) {
    case 'owner':
    case 'director':
      // Full access - strategic oversight
      return {
        orders: true,
        invoices: true,
        reconciliation: true,
        vendors: true,
        products: true,
        recipes: true,
        inventory: true,
        forecasts: true,
        nightlyReport: true,
        venueHealth: true,
        preshift: true,
        actionCenter: true,
        attestations: true,
        laborBriefing: true,
        laborRequirements: true,
        laborSchedule: true,
        aiAssistant: true,
        budget: true,
        orgSettings: true,
        compSettings: true,
        procurementSettings: true,
        entertainment: true,
      };

    case 'gm':
      // GM: Full operational access, limited admin
      return {
        orders: true,
        invoices: true,
        reconciliation: true,
        vendors: true,
        products: true,
        recipes: true,
        inventory: true,
        forecasts: true,
        nightlyReport: true,
        venueHealth: true,
        preshift: true,
        actionCenter: true,
        attestations: true,
        laborBriefing: true,
        laborRequirements: true,
        laborSchedule: true,
        aiAssistant: true,
        budget: true,
        orgSettings: false,
        compSettings: true,
        procurementSettings: true,
        entertainment: true,
      };

    case 'agm':
      // AGM: Operations focus, most access except financial admin
      return {
        orders: true,
        invoices: true,
        reconciliation: false,
        vendors: true,
        products: true,
        recipes: true,
        inventory: true,
        forecasts: true,
        nightlyReport: true,
        venueHealth: true,
        preshift: true,
        actionCenter: true,
        attestations: true,
        laborBriefing: true,
        laborRequirements: true,
        laborSchedule: true,
        aiAssistant: true,
        budget: false,
        orgSettings: false,
        compSettings: false,
        procurementSettings: true,
        entertainment: true,
      };

    case 'manager':
      // Manager: Day-to-day operations, no deep admin
      return {
        orders: true,
        invoices: true,
        reconciliation: false,
        vendors: false,
        products: true,
        recipes: true,
        inventory: true,
        forecasts: true,
        nightlyReport: true,
        venueHealth: true,
        preshift: true,
        actionCenter: true,
        attestations: true,
        laborBriefing: true,
        laborRequirements: true,
        laborSchedule: true,
        aiAssistant: true,
        budget: false,
        orgSettings: false,
        compSettings: false,
        procurementSettings: false,
        entertainment: true,
      };

    case 'exec_chef':
      // Exec Chef: Kitchen + procurement, plus operational visibility
      return {
        orders: true,
        invoices: true,
        reconciliation: false,
        vendors: true,
        products: true,
        recipes: true,
        inventory: true,
        forecasts: true,
        nightlyReport: true,
        venueHealth: false,
        preshift: true,
        actionCenter: false,
        attestations: false,
        laborBriefing: true,
        laborRequirements: false,
        laborSchedule: false,
        aiAssistant: true,
        budget: false,
        orgSettings: false,
        compSettings: false,
        procurementSettings: false,
        entertainment: false,
      };

    case 'sous_chef':
      // Sous Chef: Kitchen operations, limited visibility
      return {
        orders: true,
        invoices: false,
        reconciliation: false,
        vendors: false,
        products: true,
        recipes: true,
        inventory: true,
        forecasts: false,
        nightlyReport: false,
        venueHealth: false,
        preshift: true,
        actionCenter: false,
        attestations: false,
        laborBriefing: false,
        laborRequirements: false,
        laborSchedule: false,
        aiAssistant: true,
        budget: false,
        orgSettings: false,
        compSettings: false,
        procurementSettings: false,
        entertainment: false,
      };

    default:
      // Default to manager-level access if role is unknown
      return getNavPermissions('manager');
  }
}

/**
 * Check if a user has permission for a specific nav item
 */
export function hasNavPermission(role: UserRole, navItem: keyof NavPermissions): boolean {
  const permissions = getNavPermissions(role);
  return permissions[navItem];
}
