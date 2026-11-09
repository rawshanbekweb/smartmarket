import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { PageHeader, Card, SimulatedNotice } from '../components/common';
import { PaymentsTable } from '../components/PaymentsTable';
import { Chip } from '../components/Status';

interface ProviderStatus { method: string; integrated: boolean; credentialsConfigured: boolean; simulatorAvailable: boolean }

export default function PaymentsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const providers = useQuery({ queryKey: ['payments', 'providers'], queryFn: () => get<ProviderStatus[]>('/payments/providers') });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.payments')}
        subtitle={can('CASHIER') ? "Faqat siz qabul qilgan to'lovlar ko'rsatiladi" : "Barcha to'lovlar. Asl yozuvlar hech qachon o'chirilmaydi."}
        extra={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok">Naqd — ishlaydi</Chip>
            {providers.data?.map((p) => (
              <Chip key={p.method} tone={p.integrated ? 'ok' : 'warn'}>
                {t(`pm.${p.method}`)} — {p.integrated ? 'ulangan' : p.simulatorAvailable ? 'DEMO simulyator' : 'ulanmagan'}
              </Chip>
            ))}
          </div>
        }
      />
      <SimulatedNotice>
        Payme, Click va Uzum bilan haqiqiy integratsiya hali ulanmagan (merchant shartnomasi, imzo tekshiruvi va sinovlar talab qilinadi). Elektron to'lovlar DEMO simulyatorda "Simulyatsiya" belgisi bilan ko'rsatiladi.
      </SimulatedNotice>
      <Card>
        <PaymentsTable initial={{ search: sp.get('search') ?? undefined, status: sp.get('status') ?? undefined }} pageSize={20} />
      </Card>
    </div>
  );
}
