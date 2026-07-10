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
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      account_members: {
        Row: {
          account_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          account_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'account_members_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'account_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'accounts_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chat_messages: {
        Row: {
          id: string
          message: string
          message_type: string
          sender_id: string | null
          sender_name: string
          sent_at: string
          webinar_id: string
        }
        Insert: {
          id?: string
          message: string
          message_type?: string
          sender_id?: string | null
          sender_name: string
          sent_at?: string
          webinar_id: string
        }
        Update: {
          id?: string
          message?: string
          message_type?: string
          sender_id?: string | null
          sender_name?: string
          sent_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_messages_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'published_webinars'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_messages_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'webinars'
            referencedColumns: ['id']
          },
        ]
      }
      partners: {
        Row: {
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          type: Database['public']['Enums']['partner_type']
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: Database['public']['Enums']['partner_type']
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: Database['public']['Enums']['partner_type']
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      registrations: {
        Row: {
          access_token: string
          confirmed_at: string | null
          created_at: string
          email: string
          entered_waiting_room_at: string | null
          full_name: string | null
          id: string
          joined_webinar_at: string | null
          left_webinar_at: string | null
          offer_clicked_at: string | null
          referral_code: string | null
          referrer_url: string | null
          registered_at: string
          saw_offer_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          utm_source: string | null
          watch_time_seconds: number
          webinar_id: string
        }
        Insert: {
          access_token?: string
          confirmed_at?: string | null
          created_at?: string
          email: string
          entered_waiting_room_at?: string | null
          full_name?: string | null
          id?: string
          joined_webinar_at?: string | null
          left_webinar_at?: string | null
          offer_clicked_at?: string | null
          referral_code?: string | null
          referrer_url?: string | null
          registered_at?: string
          saw_offer_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          utm_source?: string | null
          watch_time_seconds?: number
          webinar_id: string
        }
        Update: {
          access_token?: string
          confirmed_at?: string | null
          created_at?: string
          email?: string
          entered_waiting_room_at?: string | null
          full_name?: string | null
          id?: string
          joined_webinar_at?: string | null
          left_webinar_at?: string | null
          offer_clicked_at?: string | null
          referral_code?: string | null
          referrer_url?: string | null
          registered_at?: string
          saw_offer_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          utm_source?: string | null
          watch_time_seconds?: number
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'registrations_referral_code_fkey'
            columns: ['referral_code']
            isOneToOne: false
            referencedRelation: 'partners'
            referencedColumns: ['code']
          },
          {
            foreignKeyName: 'registrations_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'registrations_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'published_webinars'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'registrations_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'webinars'
            referencedColumns: ['id']
          },
        ]
      }
      reminder_rules: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          id: string
          is_enabled: boolean
          minutes_before: number
          subject: string | null
          updated_at: string
          webinar_id: string
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          minutes_before: number
          subject?: string | null
          updated_at?: string
          webinar_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          minutes_before?: number
          subject?: string | null
          updated_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reminder_rules_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'published_webinars'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reminder_rules_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'webinars'
            referencedColumns: ['id']
          },
        ]
      }
      webinar_offers: {
        Row: {
          active: boolean
          button_text: string
          created_at: string
          description: string | null
          display_at_seconds: number | null
          id: string
          target_url: string | null
          title: string
          updated_at: string
          webinar_id: string
        }
        Insert: {
          active?: boolean
          button_text?: string
          created_at?: string
          description?: string | null
          display_at_seconds?: number | null
          id?: string
          target_url?: string | null
          title: string
          updated_at?: string
          webinar_id: string
        }
        Update: {
          active?: boolean
          button_text?: string
          created_at?: string
          description?: string | null
          display_at_seconds?: number | null
          id?: string
          target_url?: string | null
          title?: string
          updated_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'webinar_offers_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'published_webinars'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'webinar_offers_webinar_id_fkey'
            columns: ['webinar_id']
            isOneToOne: false
            referencedRelation: 'webinars'
            referencedColumns: ['id']
          },
        ]
      }
      webinars: {
        Row: {
          account_id: string
          automated_video_url: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          early_entry_minutes: number
          id: string
          max_participants: number | null
          meeting_url: string | null
          offer_enabled: boolean
          presenter_id: string | null
          presenter_name: string | null
          recording_url: string | null
          scheduled_at: string | null
          slug: string
          status: string
          title: string
          type: string
          updated_at: string
          waiting_room_enabled: boolean
        }
        Insert: {
          account_id: string
          automated_video_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          early_entry_minutes?: number
          id?: string
          max_participants?: number | null
          meeting_url?: string | null
          offer_enabled?: boolean
          presenter_id?: string | null
          presenter_name?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          slug: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          waiting_room_enabled?: boolean
        }
        Update: {
          account_id?: string
          automated_video_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          early_entry_minutes?: number
          id?: string
          max_participants?: number | null
          meeting_url?: string | null
          offer_enabled?: boolean
          presenter_id?: string | null
          presenter_name?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          slug?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          waiting_room_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'webinars_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'webinars_presenter_id_fkey'
            columns: ['presenter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      published_webinars: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_slug: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          early_entry_minutes: number | null
          id: string | null
          max_participants: number | null
          presenter_name: string | null
          scheduled_at: string | null
          slug: string | null
          status: string | null
          title: string | null
          type: string | null
          waiting_room_enabled: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: 'webinars_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      generate_partner_code: { Args: never; Returns: string }
      has_account_role: {
        Args: { p_account_id: string; p_roles: string[] }
        Returns: boolean
      }
      is_account_member: { Args: { p_account_id: string }; Returns: boolean }
      is_active_partner_code: { Args: { p_code: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_webinar_open_for_registration: {
        Args: { webinar_id: string }
        Returns: boolean
      }
      is_webinar_public: { Args: { webinar_id: string }; Returns: boolean }
    }
    Enums: {
      partner_type: 'affiliate' | 'business'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      partner_type: ['affiliate', 'business'],
    },
  },
} as const
