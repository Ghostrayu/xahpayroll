const PDFDocument = require('pdfkit');
const pool = require('../database/db');

/**
 * Fetch comprehensive worker data from all tables
 * @param {string} walletAddress - Worker's wallet address
 * @returns {Object} Complete worker data object
 */
async function fetchComprehensiveWorkerData(walletAddress) {
  try {
    // 1. FETCH USER PROFILE
    const userResult = await pool.query(`
      SELECT
        wallet_address,
        display_name,
        email,
        phone_number,
        user_type,
        created_at,
        last_login_at,
        deleted_at,
        deletion_reason
      FROM users
      WHERE wallet_address = $1
    `, [walletAddress]);

    if (userResult.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = userResult.rows[0];

    // 2. FETCH ORGANIZATION ASSOCIATIONS
    const organizationsResult = await pool.query(`
      SELECT
        o.id,
        o.organization_name,
        e.created_at as joined_at,
        e.employment_status,
        COALESCE(SUM(p.amount), 0) as total_earnings
      FROM employees e
      JOIN organizations o ON e.organization_id = o.id
      LEFT JOIN payments p ON p.employee_id = e.id
        AND p.organization_id = o.id
      WHERE e.employee_wallet_address = $1
      GROUP BY o.id, o.organization_name, e.created_at, e.employment_status
      ORDER BY e.created_at DESC
    `, [walletAddress]);

    // 3. FETCH PAYMENT CHANNELS
    const channelsResult = await pool.query(`
      SELECT
        pc.id,
        pc.channel_id,
        pc.job_name,
        pc.hourly_rate,
        pc.escrow_funded_amount,
        pc.off_chain_accumulated_balance,
        pc.status,
        pc.created_at,
        pc.closed_at,
        pc.closure_reason,
        o.organization_name
      FROM payment_channels pc
      JOIN organizations o ON pc.organization_id = o.id
      JOIN employees e ON pc.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      ORDER BY pc.created_at DESC
    `, [walletAddress]);

    // 4. FETCH WORK SESSIONS
    const workSessionsResult = await pool.query(`
      SELECT
        ws.id,
        ws.clock_in,
        ws.clock_out,
        ws.hours_worked,
        ws.hourly_rate,
        ws.total_amount,
        o.organization_name
      FROM work_sessions ws
      JOIN employees e ON ws.employee_id = e.id
      JOIN organizations o ON ws.organization_id = o.id
      WHERE e.employee_wallet_address = $1
      ORDER BY ws.clock_in DESC
    `, [walletAddress]);

    // 5. FETCH PAYMENT HISTORY
    const paymentsResult = await pool.query(`
      SELECT
        p.id,
        p.amount,
        p.paid_at,
        p.tx_hash,
        p.payment_status,
        o.organization_name
      FROM payments p
      JOIN organizations o ON p.organization_id = o.id
      JOIN employees e ON p.employee_id = e.id
      WHERE e.employee_wallet_address = $1
      ORDER BY p.paid_at DESC
    `, [walletAddress]);

    // 6. CALCULATE STATISTICS
    const activeChannels = channelsResult.rows.filter(c => c.status === 'active').length;
    const closedChannels = channelsResult.rows.filter(c => c.status === 'closed').length;
    const totalUnpaidBalance = channelsResult.rows.reduce((sum, c) => sum + parseFloat(c.off_chain_accumulated_balance || 0), 0);
    const totalSessions = workSessionsResult.rows.length;
    const totalHours = workSessionsResult.rows.reduce((sum, ws) => sum + parseFloat(ws.hours_worked || 0), 0);
    const totalPayments = paymentsResult.rows.length;
    const totalAmountReceived = paymentsResult.rows
      .filter(p => p.payment_status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return {
      user,
      organizations: organizationsResult.rows,
      channels: channelsResult.rows,
      workSessions: workSessionsResult.rows,
      payments: paymentsResult.rows,
      statistics: {
        activeChannels,
        closedChannels,
        totalUnpaidBalance,
        totalSessions,
        totalHours,
        totalPayments,
        totalAmountReceived
      }
    };
  } catch (error) {
    console.error('[FETCH_WORKER_DATA_ERROR]', error);
    throw error;
  }
}

/**
 * Generate worker data export PDF
 * @param {string} walletAddress - Worker's wallet address
 * @param {Object} res - Express response object (for streaming)
 */
async function generateWorkerDataPDF(walletAddress, res) {
  try {
    // FETCH COMPREHENSIVE DATA
    const data = await fetchComprehensiveWorkerData(walletAddress);

    // CREATE PDF DOCUMENT
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // SET RESPONSE HEADERS FOR DIRECT DOWNLOAD
    const filename = `xah_payroll_worker_${walletAddress.substring(0, 10)}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // PIPE PDF TO RESPONSE
    doc.pipe(res);

    // HELPER FUNCTIONS
    const drawLine = () => {
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
    };

    const drawSection = (title) => {
      doc.moveDown(1);
      drawLine();
      doc.fontSize(12).font('Helvetica-Bold').text(title, { align: 'left' });
      drawLine();
      doc.moveDown(0.5);
    };

    const formatDate = (date) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    const formatAmount = (amount) => {
      return `${parseFloat(amount || 0).toFixed(2)} XAH`;
    };

    // ===================================================
    // HEADER
    // ===================================================
    doc.fontSize(18).font('Helvetica-Bold').text('XAH PAYROLL - WORKER DATA EXPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    doc.text(`WALLET ADDRESS: ${data.user.wallet_address}`, { align: 'center' });
    doc.text(`EXPORT DATE: ${formatDate(new Date())}`, { align: 'center' });
    doc.text('RETENTION PERIOD: 48 HOURS AFTER DELETION', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1);

    // ===================================================
    // PROFILE INFORMATION
    // ===================================================
    drawSection('PROFILE INFORMATION');
    doc.fontSize(10).font('Helvetica');
    doc.text(`NAME: ${data.user.display_name || 'NOT PROVIDED'}`, { continued: false });
    doc.text(`EMAIL: ${data.user.email || 'NOT PROVIDED'}`, { continued: false });
    doc.text(`PHONE: ${data.user.phone_number || 'NOT PROVIDED'}`, { continued: false });
    doc.text(`USER TYPE: ${(data.user.user_type || '').toUpperCase()}`, { continued: false });
    doc.text(`REGISTERED: ${formatDate(data.user.created_at)}`, { continued: false });
    doc.text(`LAST LOGIN: ${formatDate(data.user.last_login_at)}`, { continued: false });

    if (data.user.deleted_at) {
      doc.fillColor('#FF0000');
      doc.text(`DELETION DATE: ${formatDate(data.user.deleted_at)}`, { continued: false });
      doc.text(`DELETION REASON: ${data.user.deletion_reason || 'NOT PROVIDED'}`, { continued: false });
      doc.fillColor('#000000');
    }

    // ===================================================
    // ORGANIZATION ASSOCIATIONS
    // ===================================================
    drawSection('ORGANIZATION ASSOCIATIONS');
    doc.fontSize(10).font('Helvetica');

    if (data.organizations.length === 0) {
      doc.text('NO ORGANIZATION ASSOCIATIONS FOUND', { continued: false });
    } else {
      data.organizations.forEach((org, index) => {
        doc.font('Helvetica-Bold').text(`${index + 1}. ${org.organization_name.toUpperCase()}`, { continued: false });
        doc.font('Helvetica');
        doc.text(`   STATUS: ${org.employment_status.toUpperCase()}`, { continued: false });
        doc.text(`   JOINED: ${formatDate(org.joined_at)}`, { continued: false });
        doc.text(`   TOTAL EARNINGS: ${formatAmount(org.total_earnings)}`, { continued: false });
        doc.moveDown(0.5);
      });
    }

    // ===================================================
    // PAYMENT CHANNELS
    // ===================================================
    drawSection('PAYMENT CHANNELS');
    doc.fontSize(10).font('Helvetica');
    doc.text(`ACTIVE CHANNELS: ${data.statistics.activeChannels}`, { continued: false });
    doc.text(`CLOSED CHANNELS: ${data.statistics.closedChannels}`, { continued: false });
    doc.text(`TOTAL UNPAID BALANCE: ${formatAmount(data.statistics.totalUnpaidBalance)}`, { continued: false });
    doc.moveDown(0.5);

    if (data.channels.length > 0) {
      doc.font('Helvetica-Bold').text('CHANNEL HISTORY:', { continued: false });
      doc.moveDown(0.3);

      data.channels.forEach((channel, index) => {
        doc.font('Helvetica').fontSize(9);
        doc.text(`[${index + 1}] ${channel.job_name} - ${channel.organization_name}`, { continued: false });
        doc.text(`    CHANNEL ID: ${channel.channel_id || 'N/A'}`, { continued: false });
        doc.text(`    STATUS: ${channel.status.toUpperCase()}`, { continued: false });
        doc.text(`    HOURLY RATE: ${formatAmount(channel.hourly_rate)}`, { continued: false });
        doc.text(`    ESCROW AMOUNT: ${formatAmount(channel.escrow_funded_amount)}`, { continued: false });
        doc.text(`    ACCUMULATED BALANCE: ${formatAmount(channel.off_chain_accumulated_balance)}`, { continued: false });
        doc.text(`    CREATED: ${formatDate(channel.created_at)}`, { continued: false });

        if (channel.closed_at) {
          doc.text(`    CLOSED: ${formatDate(channel.closed_at)}`, { continued: false });
          doc.text(`    CLOSURE REASON: ${channel.closure_reason || 'N/A'}`, { continued: false });
        }

        doc.moveDown(0.5);
      });
    }

    // ===================================================
    // WORK SESSIONS
    // ===================================================
    drawSection('WORK SESSIONS');
    doc.fontSize(10).font('Helvetica');
    doc.text(`TOTAL SESSIONS: ${data.statistics.totalSessions}`, { continued: false });
    doc.text(`TOTAL HOURS WORKED: ${data.statistics.totalHours.toFixed(2)} HOURS`, { continued: false });
    doc.moveDown(0.5);

    if (data.workSessions.length > 0) {
      doc.font('Helvetica-Bold').text('SESSION HISTORY (LAST 50):', { continued: false });
      doc.moveDown(0.3);

      data.workSessions.slice(0, 50).forEach((session, index) => {
        doc.font('Helvetica').fontSize(9);
        doc.text(`[${index + 1}] ${session.organization_name}`, { continued: false });
        doc.text(`    CLOCK IN: ${formatDate(session.clock_in)}`, { continued: false });
        doc.text(`    CLOCK OUT: ${formatDate(session.clock_out)}`, { continued: false });
        doc.text(`    HOURS: ${parseFloat(session.hours_worked || 0).toFixed(2)} HOURS`, { continued: false });
        doc.text(`    RATE: ${formatAmount(session.hourly_rate)}`, { continued: false });
        doc.text(`    EARNED: ${formatAmount(session.total_amount)}`, { continued: false });
        doc.moveDown(0.4);
      });

      if (data.workSessions.length > 50) {
        doc.font('Helvetica-Oblique').fontSize(9);
        doc.text(`... AND ${data.workSessions.length - 50} MORE SESSIONS`, { continued: false });
      }
    }

    // ===================================================
    // PAYMENT HISTORY
    // ===================================================
    drawSection('PAYMENT HISTORY');
    doc.fontSize(10).font('Helvetica');
    doc.text(`TOTAL PAYMENTS: ${data.statistics.totalPayments}`, { continued: false });
    doc.text(`TOTAL AMOUNT RECEIVED: ${formatAmount(data.statistics.totalAmountReceived)}`, { continued: false });
    doc.moveDown(0.5);

    if (data.payments.length > 0) {
      doc.font('Helvetica-Bold').text('PAYMENT HISTORY (LAST 50):', { continued: false });
      doc.moveDown(0.3);

      data.payments.slice(0, 50).forEach((payment, index) => {
        doc.font('Helvetica').fontSize(9);
        doc.text(`[${index + 1}] ${payment.organization_name}`, { continued: false });
        doc.text(`    AMOUNT: ${formatAmount(payment.amount)}`, { continued: false });
        doc.text(`    DATE: ${formatDate(payment.paid_at)}`, { continued: false });
        doc.text(`    STATUS: ${payment.payment_status.toUpperCase()}`, { continued: false });
        doc.text(`    TX HASH: ${payment.tx_hash ? payment.tx_hash.substring(0, 20) + '...' : 'N/A'}`, { continued: false });
        doc.moveDown(0.4);
      });

      if (data.payments.length > 50) {
        doc.font('Helvetica-Oblique').fontSize(9);
        doc.text(`... AND ${data.payments.length - 50} MORE PAYMENTS`, { continued: false });
      }
    }

    // ===================================================
    // FOOTER
    // ===================================================
    doc.moveDown(2);
    drawLine();
    doc.fontSize(10).font('Helvetica-Bold').text('END OF REPORT', { align: 'center' });
    drawLine();
    doc.fontSize(8).font('Helvetica').fillColor('#666666');
    doc.text('XAH PAYROLL - DECENTRALIZED HOURLY PAYROLL SYSTEM', { align: 'center' });
    doc.text(`GENERATED: ${formatDate(new Date())}`, { align: 'center' });

    // ===================================================
    // LOGO IMAGE
    // ===================================================
    doc.moveDown(2);

    // Add logo image at the bottom
    const logoPath = '/Users/iranrayu/Documents/CODE/xahpayroll.folder/xahaupayroll/frontend/src/assets/images/IMG_4027.png';
    try {
      // Center the image on the page
      const imageWidth = 80; // Smaller logo size
      const pageWidth = doc.page.width; // Full page width
      const leftMargin = doc.page.margins.left; // Left margin
      const rightMargin = doc.page.margins.right; // Right margin
      const usableWidth = pageWidth - leftMargin - rightMargin; // Width between margins
      const imageX = leftMargin + (usableWidth - imageWidth) / 2; // Center horizontally

      doc.image(logoPath, imageX, doc.y, {
        width: imageWidth
      });

      // Move down by image height plus extra space
      doc.moveDown(1);
    } catch (error) {
      console.error('[PDF_IMAGE_ERROR] Failed to add logo:', error);
      // Continue without image if it fails
    }

    // FINALIZE PDF
    doc.end();

    console.log(`✅ [PDF_GENERATED] Successfully generated PDF for: ${walletAddress}`);
  } catch (error) {
    console.error('[PDF_GENERATION_ERROR]', error);

    // IF ERROR OCCURS AFTER STREAMING STARTED, END STREAM
    if (!res.headersSent) {
      res.status(500).json({
        error: 'PDF_GENERATION_FAILED',
        message: 'FAILED TO GENERATE PDF EXPORT. PLEASE TRY AGAIN.'
      });
    }

    throw error;
  }
}

module.exports = {
  generateWorkerDataPDF,
  fetchComprehensiveWorkerData
};
