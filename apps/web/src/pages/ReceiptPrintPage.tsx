import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { get } from '../lib/api';
import { Receipt, type ReceiptData } from '../components/Receipt';
import { QueryView } from '../components/common';

export default function ReceiptPrintPage() {
  const { paymentId } = useParams();
  const q = useQuery({ queryKey: ['payment', paymentId], queryFn: () => get<{ status: string; receipt: ReceiptData | null }>(`/payments/${paymentId}`) });
  useEffect(() => {
    if (q.data?.receipt) setTimeout(() => window.print(), 400);
  }, [q.data]);
  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <QueryView q={q}>
        {(p) =>
          p.receipt ? (
            <div className="flex flex-col items-center gap-4">
              <Receipt r={p.receipt} cancelled={p.status === 'CANCELLED'} />
              <Button className="no-print" icon={<Printer size={15} />} onClick={() => window.print()}>Chop etish</Button>
            </div>
          ) : (
            <div className="text-center text-slate-500">Chek mavjud emas</div>
          )
        }
      </QueryView>
    </div>
  );
}
