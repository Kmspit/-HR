/** Shared between the registration wizard (RegisterForm.tsx) and the HR
 *  employee-edit "ข้อมูลส่วนตัวเพิ่มเติม" tab (EmployeeProfileTab.tsx) so the
 *  two forms can never drift into offering different option lists for the
 *  same EmployeeProfile.maritalStatus column. */
export const MARITAL_STATUS_OPTIONS = ['โสด', 'สมรส', 'หย่าร้าง', 'หม้าย']
