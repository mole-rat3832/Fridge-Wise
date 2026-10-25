export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_edit_log: {
        Row: {
          action: Database["public"]["Enums"]["edit_action"];
          batch_id: string;
          confidence: number | null;
          created_at: string;
          field: string | null;
          food_item_id: string | null;
          id: number;
          model: string | null;
          new_value: Json | null;
          old_value: Json | null;
          reason: string | null;
          reverted_at: string | null;
          scan_id: string | null;
          source: Database["public"]["Enums"]["edit_log_source"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: Database["public"]["Enums"]["edit_action"];
          batch_id: string;
          confidence?: number | null;
          created_at?: string;
          field?: string | null;
          food_item_id?: string | null;
          id?: never;
          model?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          reason?: string | null;
          reverted_at?: string | null;
          scan_id?: string | null;
          source: Database["public"]["Enums"]["edit_log_source"];
          user_id?: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["edit_action"];
          batch_id?: string;
          confidence?: number | null;
          created_at?: string;
          field?: string | null;
          food_item_id?: string | null;
          id?: never;
          model?: string | null;
          new_value?: Json | null;
          old_value?: Json | null;
          reason?: string | null;
          reverted_at?: string | null;
          scan_id?: string | null;
          source?: Database["public"]["Enums"]["edit_log_source"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_edit_log_food_item_id_fkey";
            columns: ["food_item_id"];
            isOneToOne: false;
            referencedRelation: "food_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_edit_log_scan_id_fkey";
            columns: ["scan_id"];
            isOneToOne: false;
            referencedRelation: "scans";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          created_at: string;
          id: number;
          kind: string;
          ref_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          kind: string;
          ref_id?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          kind?: string;
          ref_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      app_public_config: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      food_items: {
        Row: {
          ai_confidence: number | null;
          barcode: string | null;
          brand: string | null;
          category: Database["public"]["Enums"]["food_category"];
          consumed_at: string | null;
          created_at: string;
          expiration_date: string | null;
          expiration_source: Database["public"]["Enums"]["field_source"] | null;
          household_id: string | null;
          id: string;
          image_path: string | null;
          is_demo: boolean;
          name: string;
          notes: string | null;
          opened_at: string | null;
          price_cents: number | null;
          purchase_date: string | null;
          quantity: number;
          scan_item_id: string | null;
          status: Database["public"]["Enums"]["item_status"];
          storage_location: Database["public"]["Enums"]["storage_location"];
          unit: Database["public"]["Enums"]["unit"];
          updated_at: string;
          user_id: string;
          user_locked_fields: string[];
          wasted_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          ai_confidence?: number | null;
          barcode?: string | null;
          brand?: string | null;
          category?: Database["public"]["Enums"]["food_category"];
          consumed_at?: string | null;
          created_at?: string;
          expiration_date?: string | null;
          expiration_source?: Database["public"]["Enums"]["field_source"] | null;
          household_id?: string | null;
          id?: string;
          image_path?: string | null;
          is_demo?: boolean;
          name: string;
          notes?: string | null;
          opened_at?: string | null;
          price_cents?: number | null;
          purchase_date?: string | null;
          quantity?: number;
          scan_item_id?: string | null;
          status?: Database["public"]["Enums"]["item_status"];
          storage_location?: Database["public"]["Enums"]["storage_location"];
          unit?: Database["public"]["Enums"]["unit"];
          updated_at?: string;
          user_id?: string;
          user_locked_fields?: string[];
          wasted_at?: string | null;
        };
        Update: {
          ai_confidence?: number | null;
          barcode?: string | null;
          brand?: string | null;
          category?: Database["public"]["Enums"]["food_category"];
          consumed_at?: string | null;
          created_at?: string;
          expiration_date?: string | null;
          expiration_source?: Database["public"]["Enums"]["field_source"] | null;
          household_id?: string | null;
          id?: string;
          image_path?: string | null;
          is_demo?: boolean;
          name?: string;
          notes?: string | null;
          opened_at?: string | null;
          price_cents?: number | null;
          purchase_date?: string | null;
          quantity?: number;
          scan_item_id?: string | null;
          status?: Database["public"]["Enums"]["item_status"];
          storage_location?: Database["public"]["Enums"]["storage_location"];
          unit?: Database["public"]["Enums"]["unit"];
          updated_at?: string;
          user_id?: string;
          user_locked_fields?: string[];
          wasted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "food_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "food_items_scan_item_fk";
            columns: ["scan_item_id"];
            isOneToOne: false;
            referencedRelation: "scan_items";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invites: {
        Row: {
          created_at: string;
          email: string;
          household_id: string;
          id: string;
          invited_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          household_id: string;
          id?: string;
          invited_by?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          household_id?: string;
          id?: string;
          invited_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          household_id: string;
          joined_at: string;
          role: Database["public"]["Enums"]["household_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          household_id: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["household_role"];
          user_id: string;
        };
        Update: {
          household_id?: string;
          joined_at?: string;
          role?: Database["public"]["Enums"]["household_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          household_size: number;
          id: string;
          locale: string;
          notify_email: boolean;
          notify_push: boolean;
          onboarded_at: string | null;
          reminder_days_before: number;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          household_size?: number;
          id: string;
          locale?: string;
          notify_email?: boolean;
          notify_push?: boolean;
          onboarded_at?: string | null;
          reminder_days_before?: number;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          household_size?: number;
          id?: string;
          locale?: string;
          notify_email?: boolean;
          notify_push?: boolean;
          onboarded_at?: string | null;
          reminder_days_before?: number;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          created_at: string;
          id: string;
          ingredients: NonNullable<Json>;
          made_at: string | null;
          model: string | null;
          saved: boolean;
          servings: number | null;
          steps: NonNullable<Json>;
          time_minutes: number | null;
          title: string;
          user_id: string;
          uses_item_ids: string[];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          ingredients?: NonNullable<Json>;
          made_at?: string | null;
          model?: string | null;
          saved?: boolean;
          servings?: number | null;
          steps?: NonNullable<Json>;
          time_minutes?: number | null;
          title: string;
          user_id?: string;
          uses_item_ids?: string[];
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredients?: NonNullable<Json>;
          made_at?: string | null;
          model?: string | null;
          saved?: boolean;
          servings?: number | null;
          steps?: NonNullable<Json>;
          time_minutes?: number | null;
          title?: string;
          user_id?: string;
          uses_item_ids?: string[];
        };
        Relationships: [];
      };
      reminder_log: {
        Row: {
          channel: string;
          created_at: string;
          food_item_id: string;
          id: number;
          sent_on: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          channel: string;
          created_at?: string;
          food_item_id: string;
          id?: never;
          sent_on: string;
          user_id?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          food_item_id?: string;
          id?: never;
          sent_on?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminder_log_food_item_id_fkey";
            columns: ["food_item_id"];
            isOneToOne: false;
            referencedRelation: "food_items";
            referencedColumns: ["id"];
          },
        ];
      };
      scan_items: {
        Row: {
          barcode: string | null;
          brand: string | null;
          category: Database["public"]["Enums"]["food_category"];
          confidence: number | null;
          created_at: string;
          created_food_item_id: string | null;
          estimated_expiration_date: string | null;
          expiration_source: Database["public"]["Enums"]["field_source"] | null;
          field_confidence: NonNullable<Json>;
          id: string;
          include: boolean;
          is_food: boolean;
          name: string;
          notes: string | null;
          position: number;
          price_cents: number | null;
          printed_date: string | null;
          printed_date_type: Database["public"]["Enums"]["printed_date_type"] | null;
          quantity: number;
          raw_text: string | null;
          scan_id: string;
          storage_instructions: string | null;
          storage_location: Database["public"]["Enums"]["storage_location"];
          unit: Database["public"]["Enums"]["unit"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          barcode?: string | null;
          brand?: string | null;
          category?: Database["public"]["Enums"]["food_category"];
          confidence?: number | null;
          created_at?: string;
          created_food_item_id?: string | null;
          estimated_expiration_date?: string | null;
          expiration_source?: Database["public"]["Enums"]["field_source"] | null;
          field_confidence?: NonNullable<Json>;
          id?: string;
          include: boolean;
          is_food?: boolean;
          name: string;
          notes?: string | null;
          position?: number;
          price_cents?: number | null;
          printed_date?: string | null;
          printed_date_type?: Database["public"]["Enums"]["printed_date_type"] | null;
          quantity?: number;
          raw_text?: string | null;
          scan_id: string;
          storage_instructions?: string | null;
          storage_location?: Database["public"]["Enums"]["storage_location"];
          unit?: Database["public"]["Enums"]["unit"];
          user_id?: string;
        };
        Update: {
          barcode?: string | null;
          brand?: string | null;
          category?: Database["public"]["Enums"]["food_category"];
          confidence?: number | null;
          created_at?: string;
          created_food_item_id?: string | null;
          estimated_expiration_date?: string | null;
          expiration_source?: Database["public"]["Enums"]["field_source"] | null;
          field_confidence?: NonNullable<Json>;
          id?: string;
          include?: boolean;
          is_food?: boolean;
          name?: string;
          notes?: string | null;
          position?: number;
          price_cents?: number | null;
          printed_date?: string | null;
          printed_date_type?: Database["public"]["Enums"]["printed_date_type"] | null;
          quantity?: number;
          raw_text?: string | null;
          scan_id?: string;
          storage_instructions?: string | null;
          storage_location?: Database["public"]["Enums"]["storage_location"];
          unit?: Database["public"]["Enums"]["unit"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scan_items_created_food_item_fk";
            columns: ["created_food_item_id"];
            isOneToOne: false;
            referencedRelation: "food_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scan_items_scan_fk";
            columns: ["scan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "scans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      scans: {
        Row: {
          attempts: number;
          confirmed_at: string | null;
          created_at: string;
          error: string | null;
          id: string;
          image_path: string | null;
          model: string | null;
          processed_at: string | null;
          purchase_date: string | null;
          raw_response: Json | null;
          status: Database["public"]["Enums"]["scan_status"];
          store_name: string | null;
          type: Database["public"]["Enums"]["scan_type"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          confirmed_at?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          image_path?: string | null;
          model?: string | null;
          processed_at?: string | null;
          purchase_date?: string | null;
          raw_response?: Json | null;
          status?: Database["public"]["Enums"]["scan_status"];
          store_name?: string | null;
          type: Database["public"]["Enums"]["scan_type"];
          user_id?: string;
        };
        Update: {
          attempts?: number;
          confirmed_at?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          image_path?: string | null;
          model?: string | null;
          processed_at?: string | null;
          purchase_date?: string | null;
          raw_response?: Json | null;
          status?: Database["public"]["Enums"]["scan_status"];
          store_name?: string | null;
          type?: Database["public"]["Enums"]["scan_type"];
          user_id?: string;
        };
        Relationships: [];
      };
      shelf_life: {
        Row: {
          category: Database["public"]["Enums"]["food_category"];
          days_opened: number | null;
          days_unopened: number;
          id: number;
          keyword: string | null;
          source: string;
          storage_location: Database["public"]["Enums"]["storage_location"];
        };
        ComputedFields: never;
        Insert: {
          category: Database["public"]["Enums"]["food_category"];
          days_opened?: number | null;
          days_unopened: number;
          id?: never;
          keyword?: string | null;
          source?: string;
          storage_location: Database["public"]["Enums"]["storage_location"];
        };
        Update: {
          category?: Database["public"]["Enums"]["food_category"];
          days_opened?: number | null;
          days_unopened?: number;
          id?: never;
          keyword?: string | null;
          source?: string;
          storage_location?: Database["public"]["Enums"]["storage_location"];
        };
        Relationships: [];
      };
    };
    Views: {
      user_stats: {
        Row: {
          household_id: string | null;
          items_used: number | null;
          items_wasted: number | null;
          money_saved_cents: number | null;
          money_wasted_cents: number | null;
          period: string | null;
          user_id: string | null;
          week_start: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      ai_usage_today: { Args: Record<PropertyKey, never>; Returns: Json };
      apply_ai_changes: {
        Args: { p_batch: Json; p_household_id?: string; p_model?: string; p_source: Database["public"]["Enums"]["edit_log_source"] };
        Returns: Json;
      };
      claim_ai_quota: { Args: { p_kind: string; p_ref_id?: string }; Returns: Json };
      clear_demo_data: { Args: Record<PropertyKey, never>; Returns: number };
      confirm_scan: { Args: { p_household_id?: string; p_items: Json; p_scan_id: string }; Returns: Json };
      create_household: { Args: { p_name: string; p_user_id: string }; Returns: Json };
      delete_household: { Args: { p_household_id: string }; Returns: undefined };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      due_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: {
          items: Json;
          local_date: string;
          subscriptions: Json;
          user_id: string;
        }[];
      };
      household_details: { Args: { p_household_id: string }; Returns: Json };
      invite_to_household: { Args: { p_email: string; p_household_id: string; p_user_id: string }; Returns: Json };
      leave_household: { Args: { p_household_id: string }; Returns: Json };
      load_demo_data: { Args: Record<PropertyKey, never>; Returns: Json };
      my_household_invites: { Args: Record<PropertyKey, never>; Returns: Json };
      my_households: { Args: Record<PropertyKey, never>; Returns: Json };
      record_item_use: { Args: { p_amount?: number; p_item_id: string }; Returns: Json };
      record_item_waste: { Args: { p_item_id: string }; Returns: Json };
      remove_household_member: { Args: { p_household_id: string; p_user_id: string }; Returns: undefined };
      rename_household: { Args: { p_household_id: string; p_name: string }; Returns: undefined };
      respond_to_household_invite: { Args: { p_accept: boolean; p_invite_id: string }; Returns: Json };
      revoke_household_invite: { Args: { p_invite_id: string }; Returns: undefined };
      shelf_life_lookup: { Args: { p_items: Json }; Returns: Json };
      store_vapid_keys: {
        Args: { p_private: string; p_public: string };
        Returns: {
          private_key: string;
          public_key: string;
        }[];
      };
      undo_ai_batch: { Args: { p_batch_id: string }; Returns: Json };
      vapid_keys: {
        Args: Record<PropertyKey, never>;
        Returns: {
          private_key: string;
          public_key: string;
        }[];
      };
      verify_cron_secret: { Args: { p_secret: string }; Returns: boolean };
    };
    Enums: {
      edit_action: "insert" | "update" | "mark_used" | "mark_wasted";
      edit_log_source: "ai_scan" | "ai_command" | "ai_recipe" | "user";
      field_source: "user" | "ai_scan" | "ai_estimate" | "ai_command" | "shelf_life_table" | "printed_date";
      food_category:
        | "produce"
        | "dairy"
        | "meat"
        | "seafood"
        | "eggs"
        | "bakery"
        | "frozen"
        | "pantry"
        | "beverages"
        | "condiments"
        | "leftovers"
        | "other";
      household_role: "owner" | "member";
      item_status: "active" | "used" | "wasted";
      printed_date_type: "best_by" | "use_by" | "sell_by" | "expires" | "freeze_by" | "other";
      scan_status: "uploaded" | "processing" | "needs_review" | "confirmed" | "failed" | "discarded";
      scan_type: "receipt" | "product";
      storage_location: "fridge" | "freezer" | "pantry";
      unit: "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l" | "fl_oz" | "gal" | "pack";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      edit_action: ["insert", "update", "mark_used", "mark_wasted"],
      edit_log_source: ["ai_scan", "ai_command", "ai_recipe", "user"],
      field_source: ["user", "ai_scan", "ai_estimate", "ai_command", "shelf_life_table", "printed_date"],
      food_category: [
        "produce",
        "dairy",
        "meat",
        "seafood",
        "eggs",
        "bakery",
        "frozen",
        "pantry",
        "beverages",
        "condiments",
        "leftovers",
        "other",
      ],
      household_role: ["owner", "member"],
      item_status: ["active", "used", "wasted"],
      printed_date_type: ["best_by", "use_by", "sell_by", "expires", "freeze_by", "other"],
      scan_status: ["uploaded", "processing", "needs_review", "confirmed", "failed", "discarded"],
      scan_type: ["receipt", "product"],
      storage_location: ["fridge", "freezer", "pantry"],
      unit: ["count", "g", "kg", "oz", "lb", "ml", "l", "fl_oz", "gal", "pack"],
    },
  },
} as const;
