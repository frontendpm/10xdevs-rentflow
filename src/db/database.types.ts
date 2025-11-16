export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  graphql_public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
  public: {
    Tables: {
      apartments: {
        Row: {
          address: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "apartments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "apartments_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      charges: {
        Row: {
          amount: number;
          attachment_path: string | null;
          comment: string | null;
          created_at: string;
          created_by: string;
          due_date: string;
          id: string;
          lease_id: string;
          type: Database["public"]["Enums"]["charge_type"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          attachment_path?: string | null;
          comment?: string | null;
          created_at?: string;
          created_by: string;
          due_date: string;
          id?: string;
          lease_id: string;
          type: Database["public"]["Enums"]["charge_type"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          attachment_path?: string | null;
          comment?: string | null;
          created_at?: string;
          created_by?: string;
          due_date?: string;
          id?: string;
          lease_id?: string;
          type?: Database["public"]["Enums"]["charge_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "charges_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_lease_id_fkey";
            columns: ["lease_id"];
            isOneToOne: false;
            referencedRelation: "leases";
            referencedColumns: ["id"];
          },
        ];
      };
      invitation_links: {
        Row: {
          accepted_by: string | null;
          apartment_id: string;
          created_at: string;
          created_by: string;
          id: string;
          status: Database["public"]["Enums"]["invitation_status"];
          token: string;
          updated_at: string;
        };
        Insert: {
          accepted_by?: string | null;
          apartment_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          status?: Database["public"]["Enums"]["invitation_status"];
          token: string;
          updated_at?: string;
        };
        Update: {
          accepted_by?: string | null;
          apartment_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          status?: Database["public"]["Enums"]["invitation_status"];
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitation_links_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_links_apartment_id_fkey";
            columns: ["apartment_id"];
            isOneToOne: false;
            referencedRelation: "apartments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      leases: {
        Row: {
          apartment_id: string;
          archived_at: string | null;
          created_at: string;
          created_by: string;
          id: string;
          notes: string | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["lease_status"];
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          apartment_id: string;
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          notes?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["lease_status"];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          apartment_id?: string;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          notes?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["lease_status"];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leases_apartment_id_fkey";
            columns: ["apartment_id"];
            isOneToOne: false;
            referencedRelation: "apartments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leases_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leases_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          charge_id: string;
          created_at: string;
          created_by: string;
          id: string;
          payment_date: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          charge_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          payment_date: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          charge_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          payment_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "charges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "charges_with_status";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      protocol_photos: {
        Row: {
          created_by: string;
          file_path: string;
          id: string;
          protocol_id: string;
          uploaded_at: string;
        };
        Insert: {
          created_by: string;
          file_path: string;
          id?: string;
          protocol_id: string;
          uploaded_at?: string;
        };
        Update: {
          created_by?: string;
          file_path?: string;
          id?: string;
          protocol_id?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "protocol_photos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "protocol_photos_protocol_id_fkey";
            columns: ["protocol_id"];
            isOneToOne: false;
            referencedRelation: "protocols";
            referencedColumns: ["id"];
          },
        ];
      };
      protocols: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          lease_id: string;
          type: Database["public"]["Enums"]["protocol_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          lease_id: string;
          type: Database["public"]["Enums"]["protocol_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          lease_id?: string;
          type?: Database["public"]["Enums"]["protocol_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "protocols_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "protocols_lease_id_fkey";
            columns: ["lease_id"];
            isOneToOne: false;
            referencedRelation: "leases";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name: string;
          id: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      charges_with_status: {
        Row: {
          amount: number | null;
          attachment_path: string | null;
          comment: string | null;
          created_at: string | null;
          created_by: string | null;
          due_date: string | null;
          id: string | null;
          is_overdue: boolean | null;
          lease_id: string | null;
          payment_status: string | null;
          remaining_amount: number | null;
          total_paid: number | null;
          type: Database["public"]["Enums"]["charge_type"] | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "charges_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "charges_lease_id_fkey";
            columns: ["lease_id"];
            isOneToOne: false;
            referencedRelation: "leases";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: Record<never, never>;
    Enums: {
      charge_type: "rent" | "bill" | "other";
      invitation_status: "pending" | "accepted" | "expired";
      lease_status: "active" | "archived";
      protocol_type: "move_in" | "move_out";
      user_role: "owner" | "tenant";
    };
    CompositeTypes: Record<never, never>;
  };
}

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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
      charge_type: ["rent", "bill", "other"],
      invitation_status: ["pending", "accepted", "expired"],
      lease_status: ["active", "archived"],
      protocol_type: ["move_in", "move_out"],
      user_role: ["owner", "tenant"],
    },
  },
} as const;
