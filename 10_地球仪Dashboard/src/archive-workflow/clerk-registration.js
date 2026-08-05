export const CLERK_REGISTRATIONS = Object.freeze([
  { level: 1, label: '助理书记官' },
  { level: 2, label: '三级书记官' },
  { level: 3, label: '二级书记官' },
  { level: 4, label: '一级书记官' },
  { level: 5, label: '高级书记官' },
  { level: 6, label: '资深书记官' },
  { level: 7, label: '首席书记官' },
]);

export const normalizeClerkRegistration = (value) => {
  const level = Number.parseInt(value, 10);
  return CLERK_REGISTRATIONS.some((entry) => entry.level === level) ? level : 1;
};

export const isValidClerkRegistration = (value) => Number.isInteger(Number(value))
  && CLERK_REGISTRATIONS.some((entry) => entry.level === Number(value));

export const clerkRegistrationLabel = (value) => (
  CLERK_REGISTRATIONS.find((entry) => entry.level === normalizeClerkRegistration(value))?.label
  || CLERK_REGISTRATIONS[0].label
);
