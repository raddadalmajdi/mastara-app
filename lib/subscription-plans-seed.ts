import type { SubscriptionPlan } from '@/lib/subscription';

/** باقات افتراضية — تُستخدم عند غياب سجل في Firestore. */
export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name_ar: 'الباقة المجانية',
    description_ar: 'ابدأ مجاناً مع فترة تجريبية — مناسبة للمحلات الصغيرة.',
    price_amount: 0,
    currency: 'SAR',
    billing_interval: 'free',
    trial_days: 14,
    features: ['مسح الفواتير', 'دفتر العملاء', 'مشاركة واتساب'],
    is_active: true,
    sort_order: 0,
  },
  {
    id: 'pro_monthly',
    name_ar: 'إيصالك برو — شهري',
    description_ar: 'كل الميزات بدون حدود — فواتير غير محدودة ودعم أولوية.',
    price_amount: 49,
    currency: 'SAR',
    billing_interval: 'month',
    trial_days: 0,
    features: ['فواتير غير محدودة', 'دفتر عملاء', 'مشاركة واتساب', 'دعم أولوية', 'مدى وApple Pay'],
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'pro_yearly',
    name_ar: 'إيصالك برو — سنوي',
    description_ar: 'وفر شهرين — اشتراك سنوي بخصم.',
    price_amount: 490,
    currency: 'SAR',
    billing_interval: 'year',
    trial_days: 0,
    features: [
      'فواتير غير محدودة',
      'دفتر عملاء',
      'مشاركة واتساب',
      'دعم أولوية',
      'مدى وApple Pay',
      'خصم سنوي',
    ],
    is_active: true,
    sort_order: 2,
  },
];
