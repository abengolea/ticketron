
export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  requestResourceData?: any;
  message?: string;
};

export class FirestorePermissionError extends Error {
  public context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    const defaultMessage = `Firestore Security Rules denied a '${context.operation}' request on path '${context.path}'.`;
    super(context.message || defaultMessage);
    this.name = 'FirestorePermissionError';
    this.context = context;

    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
