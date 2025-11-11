/**
 * Employee Mobile App
 * Mobile-optimized employee self-service
 * Clock in/out, time-off requests, availability, shift swaps
 */

import { EmployeeApp } from '@/components/employee/EmployeeApp';

export default function EmployeePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <EmployeeApp />
    </div>
  );
}
