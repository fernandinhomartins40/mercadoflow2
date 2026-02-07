export interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  productId?: string | null;
  createdAt: string;
}
