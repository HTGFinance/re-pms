import TenantShell from '@/components/TenantShell';
export const metadata = { title: 'My Home — RE-PMS' };
export default function TLayout({ children }: { children: React.ReactNode }) { return <TenantShell>{children}</TenantShell>; }
