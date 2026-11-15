import TenantShell from '@/components/TenantShell';
import { BRAND } from '@/lib/brand';
export const metadata = { title: `My Home — ${BRAND.name}` };
export default function TLayout({ children }: { children: React.ReactNode }) { return <TenantShell>{children}</TenantShell>; }
