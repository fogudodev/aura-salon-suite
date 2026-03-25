export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addon_purchases: {
        Row: {
          addon_type: string
          amount_cents: number
          created_at: string
          id: string
          professional_id: string
          quantity: number
          stripe_session_id: string | null
        }
        Insert: {
          addon_type: string
          amount_cents?: number
          created_at?: string
          id?: string
          professional_id: string
          quantity: number
          stripe_session_id?: string | null
        }
        Update: {
          addon_type?: string
          amount_cents?: number
          created_at?: string
          id?: string
          professional_id?: string
          quantity?: number
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addon_purchases_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_auth_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      blocked_times: {
        Row: {
          created_at: string
          end_time: string
          id: string
          professional_id: string
          reason: string | null
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          professional_id: string
          reason?: string | null
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          professional_id?: string
          reason?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_times_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          created_at: string
          duration_minutes: number
          employee_id: string | null
          end_time: string
          google_calendar_event_id: string | null
          id: string
          notes: string | null
          price: number
          professional_id: string
          service_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          duration_minutes?: number
          employee_id?: string | null
          end_time: string
          google_calendar_event_id?: string | null
          id?: string
          notes?: string | null
          price?: number
          professional_id: string
          service_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          duration_minutes?: number
          employee_id?: string | null
          end_time?: string
          google_calendar_event_id?: string | null
          id?: string
          notes?: string | null
          price?: number
          professional_id?: string
          service_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          client_id: string | null
          client_name: string | null
          created_at: string
          error_message: string | null
          id: string
          phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_count: number
          id: string
          message: string
          name: string
          professional_id: string
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          target_type: string
          total_contacts: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          message: string
          name: string
          professional_id: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          target_type?: string
          total_contacts?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          message?: string
          name?: string
          professional_id?: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          target_type?: string
          total_contacts?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closing_amount: number | null
          created_at: string
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          professional_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closing_amount?: number | null
          created_at?: string
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          professional_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closing_amount?: number | null
          created_at?: string
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          professional_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          cash_register_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          payment_method: string | null
          professional_id: string
          type: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          cash_register_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          professional_id: string
          type?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          cash_register_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          professional_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_rules: {
        Row: {
          cashback_percent: number
          created_at: string
          end_hour: string | null
          id: string
          is_active: boolean
          name: string
          professional_id: string
          rule_type: string
          service_id: string | null
          start_hour: string | null
          updated_at: string
        }
        Insert: {
          cashback_percent?: number
          created_at?: string
          end_hour?: string | null
          id?: string
          is_active?: boolean
          name: string
          professional_id: string
          rule_type?: string
          service_id?: string | null
          start_hour?: string | null
          updated_at?: string
        }
        Update: {
          cashback_percent?: number
          created_at?: string
          end_hour?: string | null
          id?: string
          is_active?: boolean
          name?: string
          professional_id?: string
          rule_type?: string
          service_id?: string | null
          start_hour?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          client_id: string
          created_at: string
          description: string | null
          id: string
          professional_id: string
          type: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          professional_id: string
          type?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          professional_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          client_id: string
          completed: boolean
          created_at: string
          current_value: number
          id: string
          professional_id: string
          reward_claimed: boolean
          updated_at: string
        }
        Insert: {
          challenge_id: string
          client_id: string
          completed?: boolean
          created_at?: string
          current_value?: number
          id?: string
          professional_id: string
          reward_claimed?: boolean
          updated_at?: string
        }
        Update: {
          challenge_id?: string
          client_id?: string
          completed?: boolean
          created_at?: string
          current_value?: number
          id?: string
          professional_id?: string
          reward_claimed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "loyalty_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_url: string | null
          chat_type: string
          created_at: string
          id: string
          message: string | null
          professional_id: string
          sender_name: string | null
          sender_role: string
        }
        Insert: {
          attachment_url?: string | null
          chat_type?: string
          created_at?: string
          id?: string
          message?: string | null
          professional_id: string
          sender_name?: string | null
          sender_role?: string
        }
        Update: {
          attachment_url?: string | null
          chat_type?: string
          created_at?: string
          id?: string
          message?: string | null
          professional_id?: string
          sender_name?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_cashback: {
        Row: {
          balance: number
          client_id: string
          created_at: string
          id: string
          professional_id: string
          total_earned: number
          total_used: number
          updated_at: string
        }
        Insert: {
          balance?: number
          client_id: string
          created_at?: string
          id?: string
          professional_id: string
          total_earned?: number
          total_used?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          client_id?: string
          created_at?: string
          id?: string
          professional_id?: string
          total_earned?: number
          total_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_cashback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cashback_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_loyalty: {
        Row: {
          avg_days_between_visits: number | null
          client_id: string
          created_at: string
          id: string
          last_visit_at: string | null
          level_id: string | null
          professional_id: string
          referral_count: number
          retention_status: string
          total_spent: number
          total_visits: number
          updated_at: string
        }
        Insert: {
          avg_days_between_visits?: number | null
          client_id: string
          created_at?: string
          id?: string
          last_visit_at?: string | null
          level_id?: string | null
          professional_id: string
          referral_count?: number
          retention_status?: string
          total_spent?: number
          total_visits?: number
          updated_at?: string
        }
        Update: {
          avg_days_between_visits?: number | null
          client_id?: string
          created_at?: string
          id?: string
          last_visit_at?: string | null
          level_id?: string | null
          professional_id?: string
          referral_count?: number
          retention_status?: string
          total_spent?: number
          total_visits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_loyalty_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_loyalty_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "loyalty_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_loyalty_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_packages: {
        Row: {
          amount_paid: number
          client_id: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          expires_at: string | null
          id: string
          package_id: string | null
          professional_id: string
          purchased_at: string
          status: string
          total_sessions: number
          updated_at: string
          used_sessions: number
        }
        Insert: {
          amount_paid?: number
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          package_id?: string | null
          professional_id: string
          purchased_at?: string
          status?: string
          total_sessions?: number
          updated_at?: string
          used_sessions?: number
        }
        Update: {
          amount_paid?: number
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          package_id?: string | null
          professional_id?: string
          purchased_at?: string
          status?: string
          total_sessions?: number
          updated_at?: string
          used_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          professional_id: string
          referral_code: string
          referred_client_id: string | null
          referrer_client_id: string
          reward_amount: number
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          professional_id: string
          referral_code: string
          referred_client_id?: string | null
          referrer_client_id: string
          reward_amount?: number
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          professional_id?: string
          referral_code?: string
          referred_client_id?: string | null
          referrer_client_id?: string
          reward_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_referrals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referrals_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_referrals_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          average_ticket: number | null
          avg_return_interval_days: number | null
          created_at: string
          email: string | null
          id: string
          last_completed_appointment_at: string | null
          name: string
          notes: string | null
          phone: string | null
          professional_id: string
          reactivation_score: number | null
          reactivation_status: string | null
          updated_at: string
        }
        Insert: {
          average_ticket?: number | null
          avg_return_interval_days?: number | null
          created_at?: string
          email?: string | null
          id?: string
          last_completed_appointment_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          professional_id: string
          reactivation_score?: number | null
          reactivation_status?: string | null
          updated_at?: string
        }
        Update: {
          average_ticket?: number | null
          avg_return_interval_days?: number | null
          created_at?: string
          email?: string | null
          id?: string
          last_completed_appointment_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          professional_id?: string
          reactivation_score?: number | null
          reactivation_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          booking_amount: number
          booking_id: string | null
          commission_amount: number
          commission_percentage: number
          created_at: string
          employee_id: string
          id: string
          paid_at: string | null
          professional_id: string
          status: string
        }
        Insert: {
          booking_amount?: number
          booking_id?: string | null
          commission_amount?: number
          commission_percentage?: number
          created_at?: string
          employee_id: string
          id?: string
          paid_at?: string | null
          professional_id: string
          status?: string
        }
        Update: {
          booking_amount?: number
          booking_id?: string | null
          commission_amount?: number
          commission_percentage?: number
          created_at?: string
          employee_id?: string
          id?: string
          paid_at?: string | null
          professional_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_amount: number | null
          professional_id: string
          updated_at: string
          used_count: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_amount?: number | null
          professional_id: string
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_amount?: number | null
          professional_id?: string
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_attendance: {
        Row: {
          class_id: string
          created_at: string
          enrollment_id: string
          id: string
          notes: string | null
          professional_id: string
          status: string
        }
        Insert: {
          class_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          notes?: string | null
          professional_id: string
          status?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          notes?: string | null
          professional_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "course_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_attendance_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          professional_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          professional_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          professional_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_categories_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_certificates: {
        Row: {
          certificate_url: string | null
          created_at: string
          enrollment_id: string
          id: string
          issued_at: string | null
          professional_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          certificate_url?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          issued_at?: string | null
          professional_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          certificate_url?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          issued_at?: string | null
          professional_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_certificates_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_classes: {
        Row: {
          class_date: string
          course_id: string
          created_at: string
          end_time: string
          enrolled_count: number
          id: string
          instructor_name: string | null
          location: string | null
          max_students: number
          modality: string
          name: string
          notes: string | null
          online_link: string | null
          professional_id: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          class_date: string
          course_id: string
          created_at?: string
          end_time: string
          enrolled_count?: number
          id?: string
          instructor_name?: string | null
          location?: string | null
          max_students?: number
          modality?: string
          name: string
          notes?: string | null
          online_link?: string | null
          professional_id: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          class_date?: string
          course_id?: string
          created_at?: string
          end_time?: string
          enrolled_count?: number
          id?: string
          instructor_name?: string | null
          location?: string | null
          max_students?: number
          modality?: string
          name?: string
          notes?: string | null
          online_link?: string | null
          professional_id?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_classes_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          amount_paid: number
          class_id: string
          client_id: string | null
          course_id: string
          created_at: string
          enrolled_at: string
          enrollment_status: string
          id: string
          origin: string
          payment_method: string | null
          payment_status: string
          professional_id: string
          student_city: string | null
          student_cpf: string | null
          student_email: string | null
          student_name: string
          student_notes: string | null
          student_phone: string | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          class_id: string
          client_id?: string | null
          course_id: string
          created_at?: string
          enrolled_at?: string
          enrollment_status?: string
          id?: string
          origin?: string
          payment_method?: string | null
          payment_status?: string
          professional_id: string
          student_city?: string | null
          student_cpf?: string | null
          student_email?: string | null
          student_name: string
          student_notes?: string | null
          student_phone?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          class_id?: string
          client_id?: string | null
          course_id?: string
          created_at?: string
          enrolled_at?: string
          enrollment_status?: string
          id?: string
          origin?: string
          payment_method?: string | null
          payment_status?: string
          professional_id?: string
          student_city?: string | null
          student_cpf?: string | null
          student_email?: string | null
          student_name?: string
          student_notes?: string | null
          student_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "course_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_materials: {
        Row: {
          course_id: string
          created_at: string
          file_url: string | null
          id: string
          material_type: string
          name: string
          professional_id: string
          sort_order: number
        }
        Insert: {
          course_id: string
          created_at?: string
          file_url?: string | null
          id?: string
          material_type?: string
          name: string
          professional_id: string
          sort_order?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          file_url?: string | null
          id?: string
          material_type?: string
          name?: string
          professional_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      course_waitlist: {
        Row: {
          class_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notified: boolean
          phone: string | null
          professional_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notified?: boolean
          phone?: string | null
          professional_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notified?: boolean
          phone?: string | null
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_waitlist_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "course_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_waitlist_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category_id: string | null
          cover_image_url: string | null
          created_at: string
          full_description: string | null
          has_certificate: boolean
          id: string
          installments: number
          materials_included: string | null
          max_students: number
          modality: string
          name: string
          prerequisites: string | null
          price: number
          professional_id: string
          short_description: string | null
          slug: string | null
          status: string
          syllabus: string | null
          updated_at: string
          workload_hours: number
        }
        Insert: {
          category_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          full_description?: string | null
          has_certificate?: boolean
          id?: string
          installments?: number
          materials_included?: string | null
          max_students?: number
          modality?: string
          name: string
          prerequisites?: string | null
          price?: number
          professional_id: string
          short_description?: string | null
          slug?: string | null
          status?: string
          syllabus?: string | null
          updated_at?: string
          workload_hours?: number
        }
        Update: {
          category_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          full_description?: string | null
          has_certificate?: boolean
          id?: string
          installments?: number
          materials_included?: string | null
          max_students?: number
          modality?: string
          name?: string
          prerequisites?: string | null
          price?: number
          professional_id?: string
          short_description?: string | null
          slug?: string | null
          status?: string
          syllabus?: string | null
          updated_at?: string
          workload_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_message_usage: {
        Row: {
          campaigns_sent: number
          created_at: string
          id: string
          professional_id: string
          reminders_sent: number
          usage_date: string
        }
        Insert: {
          campaigns_sent?: number
          created_at?: string
          id?: string
          professional_id: string
          reminders_sent?: number
          usage_date?: string
        }
        Update: {
          campaigns_sent?: number
          created_at?: string
          id?: string
          professional_id?: string
          reminders_sent?: number
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_message_usage_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_services: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          service_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_working_hours: {
        Row: {
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          is_active: boolean
          professional_id: string
          start_time: string
        }
        Insert: {
          day_of_week: number
          employee_id: string
          end_time: string
          id?: string
          is_active?: boolean
          professional_id: string
          start_time: string
        }
        Update: {
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          is_active?: boolean
          professional_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_working_hours_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_hours_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          employee_id: string | null
          expense_date: string
          id: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          employee_id?: string | null
          expense_date?: string
          id?: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          employee_id?: string | null
          expense_date?: string
          id?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          category: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          label: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          label: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          professional_id: string
          refresh_token: string
          sync_enabled: boolean
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          professional_id: string
          refresh_token: string
          sync_enabled?: boolean
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          professional_id?: string
          refresh_token?: string
          sync_enabled?: boolean
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_tokens_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          access_token: string
          account_name: string | null
          auto_comment_reply_enabled: boolean
          auto_reply_enabled: boolean
          created_at: string
          id: string
          instagram_user_id: string
          is_active: boolean
          page_id: string
          professional_id: string
          token_expiration: string | null
          updated_at: string
          username: string
        }
        Insert: {
          access_token: string
          account_name?: string | null
          auto_comment_reply_enabled?: boolean
          auto_reply_enabled?: boolean
          created_at?: string
          id?: string
          instagram_user_id: string
          is_active?: boolean
          page_id: string
          professional_id: string
          token_expiration?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          access_token?: string
          account_name?: string | null
          auto_comment_reply_enabled?: boolean
          auto_reply_enabled?: boolean
          created_at?: string
          id?: string
          instagram_user_id?: string
          is_active?: boolean
          page_id?: string
          professional_id?: string
          token_expiration?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_keywords: {
        Row: {
          created_at: string
          custom_response: string | null
          id: string
          is_active: boolean
          keyword: string
          professional_id: string
          response_type: string
          trigger_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_response?: string | null
          id?: string
          is_active?: boolean
          keyword: string
          professional_id: string
          response_type?: string
          trigger_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_response?: string | null
          id?: string
          is_active?: boolean
          keyword?: string
          professional_id?: string
          response_type?: string
          trigger_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_keywords_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_messages: {
        Row: {
          booking_id: string | null
          created_at: string
          direction: string
          id: string
          instagram_user_id: string
          is_read: boolean
          message_text: string | null
          message_type: string
          professional_id: string
          sender_id: string
          sender_username: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          instagram_user_id: string
          is_read?: boolean
          message_text?: string | null
          message_type?: string
          professional_id: string
          sender_id: string
          sender_username?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          instagram_user_id?: string
          is_read?: boolean
          message_text?: string | null
          message_type?: string
          professional_id?: string
          sender_id?: string
          sender_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_messages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_challenges: {
        Row: {
          challenge_type: string
          created_at: string
          description: string | null
          ends_at: string
          id: string
          is_active: boolean
          professional_id: string
          reward_description: string | null
          reward_type: string
          reward_value: number
          starts_at: string
          target_value: number
          title: string
          updated_at: string
        }
        Insert: {
          challenge_type?: string
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          professional_id: string
          reward_description?: string | null
          reward_type?: string
          reward_value?: number
          starts_at: string
          target_value?: number
          title: string
          updated_at?: string
        }
        Update: {
          challenge_type?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          professional_id?: string
          reward_description?: string | null
          reward_type?: string
          reward_value?: number
          starts_at?: string
          target_value?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_challenges_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_config: {
        Row: {
          cashback_enabled: boolean
          challenges_enabled: boolean
          created_at: string
          default_cashback_percent: number
          id: string
          levels_enabled: boolean
          professional_id: string
          referral_enabled: boolean
          referral_new_client_bonus: number
          referral_reward_amount: number
          updated_at: string
        }
        Insert: {
          cashback_enabled?: boolean
          challenges_enabled?: boolean
          created_at?: string
          default_cashback_percent?: number
          id?: string
          levels_enabled?: boolean
          professional_id: string
          referral_enabled?: boolean
          referral_new_client_bonus?: number
          referral_reward_amount?: number
          updated_at?: string
        }
        Update: {
          cashback_enabled?: boolean
          challenges_enabled?: boolean
          created_at?: string
          default_cashback_percent?: number
          id?: string
          levels_enabled?: boolean
          professional_id?: string
          referral_enabled?: boolean
          referral_new_client_bonus?: number
          referral_reward_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_config_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_levels: {
        Row: {
          benefits: string[] | null
          cashback_bonus_percent: number
          color: string
          created_at: string
          id: string
          min_spent: number
          min_visits: number
          name: string
          professional_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          benefits?: string[] | null
          cashback_bonus_percent?: number
          color?: string
          created_at?: string
          id?: string
          min_spent?: number
          min_visits?: number
          name: string
          professional_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          benefits?: string[] | null
          cashback_bonus_percent?: number
          color?: string
          created_at?: string
          id?: string
          min_spent?: number
          min_visits?: number
          name?: string
          professional_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_levels_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_config: {
        Row: {
          accept_card: boolean
          accept_cash: boolean
          accept_pix: boolean
          created_at: string
          id: string
          pix_beneficiary_name: string | null
          pix_key: string | null
          pix_key_type: string | null
          professional_id: string
          signal_enabled: boolean
          signal_type: string
          signal_value: number
          updated_at: string
        }
        Insert: {
          accept_card?: boolean
          accept_cash?: boolean
          accept_pix?: boolean
          created_at?: string
          id?: string
          pix_beneficiary_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          professional_id: string
          signal_enabled?: boolean
          signal_type?: string
          signal_value?: number
          updated_at?: string
        }
        Update: {
          accept_card?: boolean
          accept_cash?: boolean
          accept_pix?: boolean
          created_at?: string
          id?: string
          pix_beneficiary_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          professional_id?: string
          signal_enabled?: boolean
          signal_type?: string
          signal_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_config_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          id: string
          payment_method: string | null
          professional_id: string
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string | null
          professional_id: string
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string | null
          professional_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          campaign_max_contacts: number
          campaign_min_interval_hours: number
          created_at: string
          daily_campaigns: number
          daily_reminders: number
          id: string
          plan_id: string
          updated_at: string
        }
        Insert: {
          campaign_max_contacts?: number
          campaign_min_interval_hours?: number
          created_at?: string
          daily_campaigns?: number
          daily_reminders?: number
          id?: string
          plan_id: string
          updated_at?: string
        }
        Update: {
          campaign_max_contacts?: number
          campaign_min_interval_hours?: number
          created_at?: string
          daily_campaigns?: number
          daily_reminders?: number
          id?: string
          plan_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_reviews: {
        Row: {
          booking_id: string | null
          client_name: string
          client_phone: string | null
          comment: string | null
          created_at: string
          id: string
          professional_id: string
          rating: number
        }
        Insert: {
          booking_id?: string | null
          client_name: string
          client_phone?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          professional_id: string
          rating?: number
        }
        Update: {
          booking_id?: string | null
          client_name?: string
          client_phone?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          professional_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          professional_id: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          professional_id: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          professional_id?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_feature_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_feature_overrides_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_limits: {
        Row: {
          campaign_max_contacts: number | null
          campaign_min_interval_hours: number | null
          created_at: string
          daily_campaigns: number | null
          daily_reminders: number | null
          extra_campaigns_purchased: number
          extra_contacts_purchased: number
          extra_reminders_purchased: number
          id: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          campaign_max_contacts?: number | null
          campaign_min_interval_hours?: number | null
          created_at?: string
          daily_campaigns?: number | null
          daily_reminders?: number | null
          extra_campaigns_purchased?: number
          extra_contacts_purchased?: number
          extra_reminders_purchased?: number
          id?: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          campaign_max_contacts?: number | null
          campaign_min_interval_hours?: number | null
          created_at?: string
          daily_campaigns?: number | null
          daily_reminders?: number | null
          extra_campaigns_purchased?: number
          extra_contacts_purchased?: number
          extra_reminders_purchased?: number
          id?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_limits_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          bg_color: string | null
          bio: string | null
          blocked_reason: string | null
          booking_advance_weeks: number
          business_name: string | null
          component_color: string | null
          confirmation_message: string | null
          cover_url: string | null
          created_at: string
          email: string
          feature_public_page: boolean
          feature_reports: boolean
          feature_whatsapp: boolean
          followup_message: string | null
          id: string
          is_blocked: boolean
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string | null
          reminder_message: string | null
          slug: string | null
          stripe_customer_id: string | null
          system_accent_color: string | null
          system_sidebar_color: string | null
          system_sidebar_text_color: string | null
          text_color: string | null
          updated_at: string
          user_id: string
          welcome_description: string | null
          welcome_message: string | null
          welcome_title: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bg_color?: string | null
          bio?: string | null
          blocked_reason?: string | null
          booking_advance_weeks?: number
          business_name?: string | null
          component_color?: string | null
          confirmation_message?: string | null
          cover_url?: string | null
          created_at?: string
          email?: string
          feature_public_page?: boolean
          feature_reports?: boolean
          feature_whatsapp?: boolean
          followup_message?: string | null
          id?: string
          is_blocked?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          reminder_message?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          system_accent_color?: string | null
          system_sidebar_color?: string | null
          system_sidebar_text_color?: string | null
          text_color?: string | null
          updated_at?: string
          user_id: string
          welcome_description?: string | null
          welcome_message?: string | null
          welcome_title?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bg_color?: string | null
          bio?: string | null
          blocked_reason?: string | null
          booking_advance_weeks?: number
          business_name?: string | null
          component_color?: string | null
          confirmation_message?: string | null
          cover_url?: string | null
          created_at?: string
          email?: string
          feature_public_page?: boolean
          feature_reports?: boolean
          feature_whatsapp?: boolean
          followup_message?: string | null
          id?: string
          is_blocked?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          reminder_message?: string | null
          slug?: string | null
          stripe_customer_id?: string | null
          system_accent_color?: string | null
          system_sidebar_color?: string | null
          system_sidebar_text_color?: string | null
          text_color?: string | null
          updated_at?: string
          user_id?: string
          welcome_description?: string | null
          welcome_message?: string | null
          welcome_title?: string | null
        }
        Relationships: []
      }
      reactivation_campaign_recipients: {
        Row: {
          campaign_id: string
          client_id: string
          client_name: string | null
          client_phone: string | null
          conversion_booking_id: string | null
          conversion_value: number | null
          converted_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          message_payload: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          client_id: string
          client_name?: string | null
          client_phone?: string | null
          conversion_booking_id?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_payload?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string
          client_name?: string | null
          client_phone?: string | null
          conversion_booking_id?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_payload?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reactivation_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      reactivation_campaigns: {
        Row: {
          completed_at: string | null
          converted_count: number | null
          created_at: string
          id: string
          message_template: string
          name: string
          professional_id: string
          revenue_generated: number | null
          scheduled_at: string | null
          segment_filter: Json | null
          send_limit_per_day: number | null
          send_mode: string
          sent_count: number | null
          started_at: string | null
          status: string
          total_recipients: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          converted_count?: number | null
          created_at?: string
          id?: string
          message_template: string
          name: string
          professional_id: string
          revenue_generated?: number | null
          scheduled_at?: string | null
          segment_filter?: Json | null
          send_limit_per_day?: number | null
          send_mode?: string
          sent_count?: number | null
          started_at?: string | null
          status?: string
          total_recipients?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          converted_count?: number | null
          created_at?: string
          id?: string
          message_template?: string
          name?: string
          professional_id?: string
          revenue_generated?: number | null
          scheduled_at?: string | null
          segment_filter?: Json | null
          send_limit_per_day?: number | null
          send_mode?: string
          sent_count?: number | null
          started_at?: string | null
          status?: string
          total_recipients?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      reactivation_events: {
        Row: {
          campaign_id: string | null
          client_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          professional_id: string
          recipient_id: string | null
          value: number | null
        }
        Insert: {
          campaign_id?: string | null
          client_id: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          professional_id: string
          recipient_id?: string | null
          value?: number | null
        }
        Update: {
          campaign_id?: string | null
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          professional_id?: string
          recipient_id?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reactivation_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "reactivation_campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string | null
          client_name: string
          client_phone: string | null
          comment: string | null
          created_at: string
          employee_id: string | null
          id: string
          is_public: boolean
          professional_id: string
          rating: number
        }
        Insert: {
          booking_id?: string | null
          client_name: string
          client_phone?: string | null
          comment?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          is_public?: boolean
          professional_id: string
          rating?: number
        }
        Update: {
          booking_id?: string | null
          client_name?: string
          client_phone?: string | null
          comment?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          is_public?: boolean
          professional_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_employees: {
        Row: {
          avatar_url: string | null
          commission_percentage: number
          created_at: string
          email: string | null
          has_login: boolean
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role: string
          salon_id: string
          specialty: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          commission_percentage?: number
          created_at?: string
          email?: string | null
          has_login?: boolean
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          role?: string
          salon_id: string
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          commission_percentage?: number
          created_at?: string
          email?: string | null
          has_login?: boolean
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role?: string
          salon_id?: string
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salon_employees_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          original_price: number
          price: number
          professional_id: string
          service_id: string | null
          total_sessions: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          original_price?: number
          price?: number
          professional_id: string
          service_id?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          original_price?: number
          price?: number
          professional_id?: string
          service_id?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          maintenance_interval_days: number | null
          name: string
          price: number
          professional_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          maintenance_interval_days?: number | null
          name: string
          price?: number
          professional_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          maintenance_interval_days?: number | null
          name?: string
          price?: number
          professional_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          max_bookings_per_month: number | null
          max_clients: number | null
          max_services: number | null
          plan_id: string | null
          professional_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          max_bookings_per_month?: number | null
          max_clients?: number | null
          max_services?: number | null
          plan_id?: string | null
          professional_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          max_bookings_per_month?: number | null
          max_clients?: number | null
          max_services?: number | null
          plan_id?: string | null
          professional_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_events: {
        Row: {
          booking_id: string | null
          campaign_id: string | null
          channel: string
          client_id: string | null
          client_phone: string | null
          created_at: string
          event_type: string | null
          id: string
          professional_id: string
          recommended_service_id: string | null
          source_service_id: string | null
          status: string
          upsell_revenue: number
          value: number | null
        }
        Insert: {
          booking_id?: string | null
          campaign_id?: string | null
          channel?: string
          client_id?: string | null
          client_phone?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          professional_id: string
          recommended_service_id?: string | null
          source_service_id?: string | null
          status?: string
          upsell_revenue?: number
          value?: number | null
        }
        Update: {
          booking_id?: string | null
          campaign_id?: string | null
          channel?: string
          client_id?: string | null
          client_phone?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          professional_id?: string
          recommended_service_id?: string | null
          source_service_id?: string | null
          status?: string
          upsell_revenue?: number
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "upsell_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "upsell_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_events_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_events_recommended_service_id_fkey"
            columns: ["recommended_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_events_source_service_id_fkey"
            columns: ["source_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_recipients: {
        Row: {
          booking_id: string | null
          client_id: string | null
          client_phone: string | null
          converted_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          message_payload: string | null
          professional_id: string
          sent_at: string | null
          status: string
          upsell_rule_id: string | null
        }
        Insert: {
          booking_id?: string | null
          client_id?: string | null
          client_phone?: string | null
          converted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          message_payload?: string | null
          professional_id: string
          sent_at?: string | null
          status?: string
          upsell_rule_id?: string | null
        }
        Update: {
          booking_id?: string | null
          client_id?: string | null
          client_phone?: string | null
          converted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          message_payload?: string | null
          professional_id?: string
          sent_at?: string | null
          status?: string
          upsell_rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upsell_recipients_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_recipients_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_recipients_upsell_rule_id_fkey"
            columns: ["upsell_rule_id"]
            isOneToOne: false
            referencedRelation: "upsell_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_rules: {
        Row: {
          conversion_count: number
          created_at: string
          discount_percentage: number | null
          id: string
          is_active: boolean
          message_template: string | null
          priority: number
          professional_id: string
          promo_message: string | null
          promo_price: number | null
          recommended_service_id: string
          send_timing: string | null
          source_service_id: string
          suggestion_count: number
          updated_at: string
        }
        Insert: {
          conversion_count?: number
          created_at?: string
          discount_percentage?: number | null
          id?: string
          is_active?: boolean
          message_template?: string | null
          priority?: number
          professional_id: string
          promo_message?: string | null
          promo_price?: number | null
          recommended_service_id: string
          send_timing?: string | null
          source_service_id: string
          suggestion_count?: number
          updated_at?: string
        }
        Update: {
          conversion_count?: number
          created_at?: string
          discount_percentage?: number | null
          id?: string
          is_active?: boolean
          message_template?: string | null
          priority?: number
          professional_id?: string
          promo_message?: string | null
          promo_price?: number | null
          recommended_service_id?: string
          send_timing?: string | null
          source_service_id?: string
          suggestion_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upsell_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_rules_recommended_service_id_fkey"
            columns: ["recommended_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_rules_source_service_id_fkey"
            columns: ["source_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          client_id: string | null
          client_name: string
          client_phone: string
          created_at: string
          employee_id: string | null
          id: string
          notes: string | null
          notified_at: string | null
          preferred_date: string
          preferred_period: string
          priority: number
          professional_id: string
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_name: string
          client_phone: string
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          preferred_date: string
          preferred_period?: string
          priority?: number
          professional_id: string
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_name?: string
          client_phone?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          preferred_date?: string
          preferred_period?: string
          priority?: number
          professional_id?: string
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "salon_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_offers: {
        Row: {
          booking_id: string | null
          client_name: string
          client_phone: string
          created_at: string
          created_booking_id: string | null
          id: string
          professional_id: string
          reserved_until: string | null
          responded_at: string | null
          service_id: string | null
          slot_end: string
          slot_start: string
          status: string
          waitlist_entry_id: string | null
        }
        Insert: {
          booking_id?: string | null
          client_name: string
          client_phone: string
          created_at?: string
          created_booking_id?: string | null
          id?: string
          professional_id: string
          reserved_until?: string | null
          responded_at?: string | null
          service_id?: string | null
          slot_end: string
          slot_start: string
          status?: string
          waitlist_entry_id?: string | null
        }
        Update: {
          booking_id?: string | null
          client_name?: string
          client_phone?: string
          created_at?: string
          created_booking_id?: string | null
          id?: string
          professional_id?: string
          reserved_until?: string | null
          responded_at?: string | null
          service_id?: string | null
          slot_end?: string
          slot_start?: string
          status?: string
          waitlist_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_created_booking_id_fkey"
            columns: ["created_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_settings: {
        Row: {
          auto_process: boolean
          created_at: string
          enabled: boolean
          id: string
          max_notifications: number
          prioritize_vip: boolean
          professional_id: string
          reservation_minutes: number
          updated_at: string
        }
        Insert: {
          auto_process?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          max_notifications?: number
          prioritize_vip?: boolean
          professional_id: string
          reservation_minutes?: number
          updated_at?: string
        }
        Update: {
          auto_process?: boolean
          created_at?: string
          enabled?: boolean
          id?: string
          max_notifications?: number
          prioritize_vip?: boolean
          professional_id?: string
          reservation_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_settings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_automations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message_template: string
          professional_id: string
          trigger_type: Database["public"]["Enums"]["automation_trigger"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string
          professional_id: string
          trigger_type: Database["public"]["Enums"]["automation_trigger"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string
          professional_id?: string
          trigger_type?: Database["public"]["Enums"]["automation_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          client_phone: string
          context: Json
          created_at: string
          id: string
          messages: Json
          professional_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_phone: string
          context?: Json
          created_at?: string
          id?: string
          messages?: Json
          professional_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_phone?: string
          context?: Json
          created_at?: string
          id?: string
          messages?: Json
          professional_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          meta_phone_id: string | null
          phone_number: string | null
          professional_id: string
          qr_code: string | null
          status: Database["public"]["Enums"]["whatsapp_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          meta_phone_id?: string | null
          phone_number?: string | null
          professional_id: string
          qr_code?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          meta_phone_id?: string | null
          phone_number?: string | null
          professional_id?: string
          qr_code?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_logs: {
        Row: {
          automation_id: string | null
          booking_id: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          message_content: string
          professional_id: string
          provider: string | null
          recipient_phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          automation_id?: string | null
          booking_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_content?: string
          professional_id: string
          provider?: string | null
          recipient_phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          automation_id?: string | null
          booking_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_content?: string
          professional_id?: string
          provider?: string | null
          recipient_phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          professional_id: string
          start_time: string
        }
        Insert: {
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          professional_id: string
          start_time: string
        }
        Update: {
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          professional_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_mark_no_show: { Args: never; Returns: number }
      create_public_booking: {
        Args: {
          p_client_name: string
          p_client_phone: string
          p_professional_id: string
          p_service_id: string
          p_start_time: string
        }
        Returns: Json
      }
      enroll_student_in_class: {
        Args: {
          p_class_id: string
          p_course_id: string
          p_origin?: string
          p_professional_id: string
          p_student_city?: string
          p_student_cpf?: string
          p_student_email?: string
          p_student_name: string
          p_student_notes?: string
          p_student_phone: string
        }
        Returns: Json
      }
      get_available_slots: {
        Args: {
          p_date: string
          p_professional_id: string
          p_service_id: string
        }
        Returns: Json
      }
      get_my_professional_id: { Args: never; Returns: string }
      get_reception_salon_id: { Args: never; Returns: string }
      get_support_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          name: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_support: { Args: never; Returns: boolean }
    }
    Enums: {
      account_type: "autonomous" | "salon"
      app_role: "admin" | "professional" | "user" | "support"
      automation_trigger:
        | "booking_created"
        | "reminder_24h"
        | "reminder_3h"
        | "post_service"
        | "reactivation_30d"
        | "maintenance_reminder"
        | "post_sale_review"
        | "course_enrollment_confirmed"
        | "course_payment_confirmed"
        | "course_reminder_7d"
        | "course_reminder_1d"
        | "course_reminder_day"
        | "course_send_location"
        | "course_send_link"
        | "course_rescheduled"
        | "course_cancelled"
        | "course_waitlist_new_class"
        | "course_certificate_sent"
        | "course_followup"
        | "course_feedback_request"
        | "course_next_offer"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      subscription_status:
        | "active"
        | "past_due"
        | "cancelled"
        | "trialing"
        | "incomplete"
      whatsapp_status: "connected" | "disconnected" | "connecting" | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["autonomous", "salon"],
      app_role: ["admin", "professional", "user", "support"],
      automation_trigger: [
        "booking_created",
        "reminder_24h",
        "reminder_3h",
        "post_service",
        "reactivation_30d",
        "maintenance_reminder",
        "post_sale_review",
        "course_enrollment_confirmed",
        "course_payment_confirmed",
        "course_reminder_7d",
        "course_reminder_1d",
        "course_reminder_day",
        "course_send_location",
        "course_send_link",
        "course_rescheduled",
        "course_cancelled",
        "course_waitlist_new_class",
        "course_certificate_sent",
        "course_followup",
        "course_feedback_request",
        "course_next_offer",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      subscription_status: [
        "active",
        "past_due",
        "cancelled",
        "trialing",
        "incomplete",
      ],
      whatsapp_status: ["connected", "disconnected", "connecting", "error"],
    },
  },
} as const
