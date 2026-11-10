import { useSearchParams } from 'react-router-dom';
import { useI18n, tx } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { PageHeader, Card } from '../components/common';
import { PaymentsTable } from '../components/PaymentsTable';
import { Chip } from '../components/Status';

export default function PaymentsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [sp] = useSearchParams();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('nav.payments')}
        subtitle={can('CASHIER') ? tx("Faqat siz qabul qilgan to'lovlar ko'rsatiladi") : tx("Barcha to'lovlar. Asl yozuvlar hech qachon o'chirilmaydi.")}
        extra={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok">{t('pm.CASH')}</Chip>
            <Chip tone="ok">{t('pm.CLICK')}</Chip>
          </div>
        }
      />
      <p className="m-0 text-sm text-slate-500">{t('pay.modelNote')}</p>
      <Card>
        <PaymentsTable initial={{ search: sp.get('search') ?? undefined, status: sp.get('status') ?? undefined }} pageSize={20} />
      </Card>
    </div>
  );
}
