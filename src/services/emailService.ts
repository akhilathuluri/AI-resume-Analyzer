import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { sendBulkEmail, extractEmailFromContent, validateEmail, type EmailResult } from '../lib/emailServiceBrowser';

export interface EmailService {
  sendResumeEmail: (
    user: User,
    selectedResume: any,
    emailTitle: string,
    emailMessage: string,
    sendRealEmails: boolean
  ) => Promise<void>;
}

class EmailServiceImpl implements EmailService {
  async sendResumeEmail(
    user: User,
    selectedResume: any,
    emailTitle: string,
    emailMessage: string,
    sendRealEmails: boolean
  ): Promise<void> {
    try {
      let emailResults: EmailResult[] = [];
      let failed_deliveries = 0;

      if (sendRealEmails) {
        // Extract email from resume content
        const emailAddress = extractEmailFromContent(selectedResume.content || '');
        
        if (!emailAddress) {
          throw new Error('No email address found in the resume content');
        }

        if (!validateEmail(emailAddress)) {
          throw new Error('Invalid email address format found in resume');
        }

        // Send actual email
        emailResults = await sendBulkEmail({
          to: [emailAddress],
          subject: emailTitle,
          message: emailMessage
        });

        failed_deliveries = emailResults.filter(result => !result.success).length;
      }

      // Record communication in database
      const { data: communication, error: commError } = await supabase
        .from('communications')
        .insert([{
          user_id: user.id,
          type: 'email',
          subject: emailTitle,
          content: emailMessage,
          total_recipients: 1,
          successful_deliveries: sendRealEmails ? (emailResults.length - failed_deliveries) : 1,
          failed_deliveries: sendRealEmails ? failed_deliveries : 0,
          status: sendRealEmails ? (failed_deliveries === 0 ? 'sent' : 'failed') : 'draft'
        }])
        .select()
        .single();

      if (commError) throw commError;

      // Create recipient record
      const { error: recipientError } = await supabase
        .from('communication_recipients')
        .insert([{
          communication_id: communication.id,
          resume_id: selectedResume.id,
          user_id: user.id,
          delivery_status: sendRealEmails 
            ? (emailResults[0]?.success ? 'delivered' : 'failed') 
            : 'delivered',
          delivered_at: sendRealEmails && emailResults[0]?.success 
            ? new Date().toISOString() 
            : (sendRealEmails ? null : new Date().toISOString()),
          error_message: sendRealEmails && !emailResults[0]?.success 
            ? emailResults[0]?.error 
            : null
        }]);

      if (recipientError) throw recipientError;

      // Show success message
      if (sendRealEmails) {
        if (failed_deliveries === 0) {
          alert('Email sent successfully!');
        } else {
          alert('Failed to send email');
        }
      } else {
        alert('Communication recorded successfully');
      }

    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailServiceImpl();
