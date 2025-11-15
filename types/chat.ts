export type TransactionPayload = {
  to: string;
  chain_id: number;
  value?: string;
  data?: string;
  function?: string;
};

export type SignSwapIntent = {
  amount: string;
  origin_token_address: string;
  destination_token_address: string;
  destination_chain_id: string;
};

export type SignSwapPayload = {
  intent: SignSwapIntent;
  transaction: TransactionPayload;
};

export type MonitorTransactionPayload = {
  transaction_id: string;
};

export type ActionEvent =
  | {
      type: 'sign_transaction';
      data: TransactionPayload;
      request_id: string;
      session_id: string;
    }
  | {
      type: 'sign_swap';
      data: SignSwapPayload;
      request_id: string;
      session_id: string;
    }
  | {
      type: 'monitor_transaction';
      data: MonitorTransactionPayload;
      request_id: string;
      session_id: string;
    };

export interface ImageEvent {
  url: string;
  width: number;
  height: number;
}

export type MessageStatus = 'sending' | 'sent' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: ActionEvent[];
  images?: ImageEvent[];
  status?: MessageStatus;
}
