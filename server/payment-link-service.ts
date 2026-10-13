// Alternative approach: Use DODO Payment Links with query parameters
// According to DODO docs, you can add redirect_url as a query parameter

import 'dotenv/config';

export function createPaymentLink(
  productId: string,
  userEmail: string,
  userName: string,
  userId: string,
  planName: string,
  redirectUrl: string,
  couponCode?: string
): string {
  const baseUrl = `https://checkout.dodopayments.com/buy/${productId}`; // LIVE MODE - removed 'test.'
  
  // Build query parameters
  const params = new URLSearchParams({
    quantity: '1',
    redirect_url: redirectUrl,
    email: userEmail,
    fullName: userName,
    disableEmail: 'true',
    disableFullName: 'true',
    // Add metadata
    metadata_user_id: userId,
    metadata_plan_name: planName
  });

  // Add coupon code if provided
  // Use 'discount_code' parameter for DODO payment links
  if (couponCode) {
    params.append('discount_code', couponCode);
    console.log('🎟️ Discount code added:', couponCode);
  }

  const paymentLink = `${baseUrl}?${params.toString()}`;
  
  console.log('🔗 Generated payment link:', paymentLink);
  
  return paymentLink;
}

// Use environment variables for product IDs (supports both monthly and annual)
export const DODO_PRODUCTS_PAYMENT = {
  monthly: {
    starter: process.env.DODO_PRODUCT_STARTER || 'pdt_fKiU5OxOGA2XDKXbLEwdc',
    pro: process.env.DODO_PRODUCT_PRO || 'pdt_UAoutQGwIczmOzKs3HRXi',
    enterprise: process.env.DODO_PRODUCT_ENTERPRISE || 'pdt_iCdF8NPisfrfwDunDKHE5'
  },
  annual: {
    starter: process.env.DODO_PRODUCT_STARTER_ANNUAL || '',
    pro: process.env.DODO_PRODUCT_PRO_ANNUAL || '',
    enterprise: process.env.DODO_PRODUCT_ENTERPRISE_ANNUAL || ''
  }
};

// Debug logging
console.log('🔍 DODO Product IDs loaded:');
console.log('  Monthly - Starter:', process.env.DODO_PRODUCT_STARTER || '❌ NOT SET');
console.log('  Monthly - Pro:', process.env.DODO_PRODUCT_PRO || '❌ NOT SET');
console.log('  Monthly - Enterprise:', process.env.DODO_PRODUCT_ENTERPRISE || '❌ NOT SET');
console.log('  Annual - Starter:', process.env.DODO_PRODUCT_STARTER_ANNUAL || '❌ NOT SET');
console.log('  Annual - Pro:', process.env.DODO_PRODUCT_PRO_ANNUAL || '❌ NOT SET');
console.log('  Annual - Enterprise:', process.env.DODO_PRODUCT_ENTERPRISE_ANNUAL || '❌ NOT SET');
console.log('  Final IDs:', JSON.stringify(DODO_PRODUCTS_PAYMENT, null, 2));

