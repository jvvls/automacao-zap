export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          context: NonNullable<Json>;
          current_state: string;
          customer_id: string;
          handoff_at: string | null;
          human_handoff: boolean;
          id: string;
          last_interaction_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          context?: NonNullable<Json>;
          current_state?: string;
          customer_id: string;
          handoff_at?: string | null;
          human_handoff?: boolean;
          id?: string;
          last_interaction_at?: string;
          updated_at?: string;
        };
        Update: {
          context?: NonNullable<Json>;
          current_state?: string;
          customer_id?: string;
          handoff_at?: string | null;
          human_handoff?: boolean;
          id?: string;
          last_interaction_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          created_at: string;
          id: string;
          name: string | null;
          phone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name?: string | null;
          phone: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string | null;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          product_id: string;
          product_name_snapshot: string;
          quantity: number;
          unit_price_snapshot: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          product_id: string;
          product_name_snapshot: string;
          quantity: number;
          unit_price_snapshot: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name_snapshot?: string;
          quantity?: number;
          unit_price_snapshot?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          created_at: string;
          id: string;
          new_status: string;
          order_id: string;
          previous_status: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          new_status: string;
          order_id: string;
          previous_status?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          new_status?: string;
          order_id?: string;
          previous_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          created_at: string;
          customer_id: string;
          destination_postal_code: string | null;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          shipping_cost: number | null;
          shipping_service: string | null;
          status: string;
          subtotal: number;
          total_estimated: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          customer_id: string;
          destination_postal_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          shipping_cost?: number | null;
          shipping_service?: string | null;
          status?: string;
          subtotal: number;
          total_estimated?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          destination_postal_code?: string | null;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          shipping_cost?: number | null;
          shipping_service?: string | null;
          status?: string;
          subtotal?: number;
          total_estimated?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          base_price: number;
          category_id: string;
          created_at: string;
          description: string | null;
          id: string;
          image_path: string | null;
          name: string;
          shipping_height_cm: number;
          shipping_length_cm: number;
          shipping_weight_kg: number;
          shipping_width_cm: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          base_price: number;
          category_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          name: string;
          shipping_height_cm: number;
          shipping_length_cm: number;
          shipping_weight_kg: number;
          shipping_width_cm: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          base_price?: number;
          category_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          name?: string;
          shipping_height_cm?: number;
          shipping_length_cm?: number;
          shipping_weight_kg?: number;
          shipping_width_cm?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      shipping_quotes: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          delivery_days: number | null;
          destination_postal_code: string;
          expires_at: string | null;
          id: string;
          order_id: string | null;
          price: number;
          provider: string;
          service_name: string;
        };
        ComputedFields: never;
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          delivery_days?: number | null;
          destination_postal_code: string;
          expires_at?: string | null;
          id?: string;
          order_id?: string | null;
          price: number;
          provider: string;
          service_name: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          delivery_days?: number | null;
          destination_postal_code?: string;
          expires_at?: string | null;
          id?: string;
          order_id?: string | null;
          price?: number;
          provider?: string;
          service_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipping_quotes_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipping_quotes_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_inbound_messages: {
        Row: {
          attempts: number;
          conversation_id: string | null;
          error: string | null;
          id: string;
          payload: NonNullable<Json>;
          phone: string;
          processed_at: string | null;
          received_at: string;
          status: string;
          wa_message_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          conversation_id?: string | null;
          error?: string | null;
          id?: string;
          payload: NonNullable<Json>;
          phone: string;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          wa_message_id: string;
        };
        Update: {
          attempts?: number;
          conversation_id?: string | null;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          phone?: string;
          processed_at?: string | null;
          received_at?: string;
          status?: string;
          wa_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbound_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_order_with_items: {
        Args: { p_customer_id: string; p_idempotency_key: string; p_items: Json };
        Returns: string;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
