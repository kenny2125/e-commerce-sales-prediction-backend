const nodemailer = require('nodemailer');

// Configure transporter using Gmail SMTP and environment variables for credentials
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER, // Gmail address
    pass: process.env.SMTP_PASS  // App password or OAuth2 token
  }
});

// Generate HTML receipt using same format as front-end print view
function generateReceiptHTML(order) {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0);
  };

  const originalTotal = order.originalAmount || order.totalAmount;
  const discountAmount = order.discountAmount || 0;
  const grandTotal = order.totalAmount;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Order #${order.orderID} - Receipt</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .order-info div { margin-bottom: 5px; }
    .label { font-weight: bold; display: inline-block; width: 150px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; font-size: 1.1em; }
    .discount-row { color: #e53e3e; }
  </style>
</head>
<body>
  <div class="header">
    <h1>1618 Office Solutions</h1>
    <h2>Order Receipt</h2>
  </div>
  <div class="order-info">
    <div><span class="label">Order #:</span> ${order.orderID}</div>
    <div><span class="label">Date:</span> ${formatDate(order.orderDate)}</div>
    <div><span class="label">Customer:</span> ${order.customerName}</div>
    ${order.companyName ? `<div><span class="label">Company:</span> ${order.companyName}</div>` : ''}
    <div><span class="label">Address:</span> ${order.address}</div>
    <div><span class="label">Contact:</span> ${order.contactNumber}</div>
    ${order.paymentMethod ? `<div><span class="label">Payment Method:</span> ${order.paymentMethod}</div>` : ''}
    ${order.pickupMethod ? `<div><span class="label">Delivery Method:</span> ${order.pickupMethod}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:50%">Product</th>
        <th class="text-right">Quantity</th>
        <th class="text-right">Price</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${order.items.map(item => `
        <tr>
          <td>${item.product_name}${item.variant_name ? `<br><small>${item.variant_name}</small>` : ''}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">${formatCurrency(item.price_at_time)}</td>
          <td class="text-right">${formatCurrency(item.quantity * item.price_at_time)}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      ${discountAmount > 0 ? `
        <tr>
          <td colspan="3" class="text-right">Original Total:</td>
          <td class="text-right">${formatCurrency(originalTotal)}</td>
        </tr>
        <tr class="discount-row">
          <td colspan="3" class="text-right">Discount:</td>
          <td class="text-right">-${formatCurrency(discountAmount)}</td>
        </tr>
      ` : ''}
      <tr class="total-row">
        <td colspan="3" class="text-right">Grand Total:</td>
        <td class="text-right">${formatCurrency(grandTotal)}</td>
      </tr>
    </tfoot>
  </table>
  <div style="text-align:center; margin-top:30px;">
    <p>Thank you for your business!</p>
  </div>
</body>
</html>`;
}

// Send order receipt email
async function sendOrderReceipt(order, toEmail) {
  const html = generateReceiptHTML(order);
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: toEmail,
    subject: `Order Receipt - #${order.orderID}`,
    html
  });
}

module.exports = { sendOrderReceipt };
