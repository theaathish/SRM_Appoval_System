'use client';

import { useState, useRef, useEffect } from 'react';

interface UploadedFile {
  url: string;
  filename: string;
  size: number;
}

interface ApprovalModalProps {
  requestId: string;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (data: {
    action: string;
    notes?: string;
    budgetAvailable?: boolean;
    forwardedMessage?: string;
    attachments?: string[];
    target?: 'sop' | 'accountant' | 'mma' | 'hr' | 'audit' | 'it';
  }) => Promise<void>;
  currentStatus: string;
  userRole?: string; // Optionally pass user role for UI logic
}

export default function ApprovalModal({ 
  requestId, 
  isOpen, 
  onClose, 
  onApprove,
  currentStatus,
  userRole
}: ApprovalModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [action, setAction] = useState('approve');
  const [notes, setNotes] = useState('');
  const [budgetAvailable, setBudgetAvailable] = useState<boolean | null>(null);
  const [forwardedMessage, setForwardedMessage] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarifyTarget, setClarifyTarget] = useState<'sop' | 'accountant' | 'mma' | 'hr' | 'audit' | 'it' | ''>('');

  // Roles that can only respond to clarifications (no approval/reject actions)
  const clarificationOnlyRoles = ['sop_verifier', 'accountant', 'mma', 'hr', 'audit', 'it'];
  const isClarificationOnlyUser = clarificationOnlyRoles.includes(userRole || '');
  
  // Institution Manager: can only clarify, reject, forward (NO approve)
  const isInstitutionManager = userRole === 'institution_manager';
  
  // Senior roles: can only approve (NO reject, clarification, forward) - excluding Dean who has clarification capabilities
  const approvalOnlyRoles = ['vp', 'head_of_institution', 'chief_director', 'chairman'];
  const isApprovalOnlyUser = approvalOnlyRoles.includes(userRole || '');
  
  // Dean has special capabilities: approve, clarify (with 4 departments), reject, forward
  const isDean = userRole === 'dean';
  
  // Check if current status is a clarification status
  const isClarificationStatus = currentStatus === 'sop_clarification' || 
                               currentStatus === 'budget_clarification' || 
                               currentStatus === 'department_clarification';

  // Roles that cannot request clarifications (they can only respond to them)
  const rolesWithoutClarificationOption = ['sop_verifier', 'accountant', 'mma', 'hr', 'audit', 'it'];
  const canRequestClarification = userRole === 'institution_manager' || userRole === 'dean';

  // Reset action to appropriate default based on user type and status
  useEffect(() => {
    if (isClarificationOnlyUser && isClarificationStatus) {
      // For clarification-only users in clarification status, default to clarify (response)
      if (action !== 'clarify') {
        setAction('clarify');
        setClarifyTarget('');
      }
    } else if (isApprovalOnlyUser) {
      // For approval-only users (VP, HOI, Chief Director, Chairman), default to approve
      if (action !== 'approve') {
        setAction('approve');
        setClarifyTarget('');
      }
    } else if (isInstitutionManager) {
      // For Institution Manager, default to reject (since they can't approve)
      if (!['reject', 'clarify', 'forward'].includes(action)) {
        setAction('reject');
        setClarifyTarget('');
      }
    } else if (isDean) {
      // For Dean, default to approve (they have full capabilities)
      if (!['approve', 'reject', 'clarify', 'forward'].includes(action)) {
        setAction('approve');
        setClarifyTarget('');
      }
    } else if (!canRequestClarification && action === 'clarify') {
      // For users who can't request clarifications, reset to approve
      setAction('approve');
      setClarifyTarget('');
    }
  }, [canRequestClarification, action, isClarificationOnlyUser, isClarificationStatus, isApprovalOnlyUser, isInstitutionManager, isDean]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onApprove({
        action,
        notes: action !== 'forward' ? notes : undefined,
        budgetAvailable: budgetAvailable !== null ? budgetAvailable : undefined,
        forwardedMessage: action === 'forward' ? forwardedMessage : undefined,
        attachments: [...attachments, ...uploadedFiles.map(file => file.url)],
        target: action === 'clarify' && clarifyTarget ? clarifyTarget : undefined,
      });
      // Reset form
      setAction('approve');
      setNotes('');
      setBudgetAvailable(null);
      setForwardedMessage('');
      setAttachments([]);
      setUploadedFiles([]);
      setClarifyTarget('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process action');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Create FormData for upload
        const formData = new FormData();
        formData.append('file', file);
        
        // Upload file
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload file');
        }
        
        const result = await response.json();
        setUploadedFiles(prev => [...prev, result]);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddAttachmentUrl = () => {
    const url = prompt('Enter document URL:');
    if (url) {
      setAttachments([...attachments, url]);
    }
  };

  const handleRemoveAttachmentUrl = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">Process Request</h3>
          <p className="text-sm text-gray-500">Current status: {currentStatus}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                if (e.target.value !== 'clarify') setClarifyTarget('');
              }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            >
              {/* For clarification-only users in clarification status, only show clarification response */}
              {isClarificationOnlyUser && isClarificationStatus ? (
                <>
                  <option value="clarify">Submit Clarification Response</option>
                </>
              ) : isApprovalOnlyUser ? (
                <>
                  {/* Senior roles (VP, HOI, Chief Director, Chairman) can only approve */}
                  <option value="approve">Approve</option>
                </>
              ) : isInstitutionManager ? (
                <>
                  {/* Institution Manager can clarify, reject, forward (NO approve) */}
                  <option value="reject">Reject</option>
                  <option value="clarify">Request Clarification</option>
                  <option value="forward">Forward</option>
                </>
              ) : isDean ? (
                <>
                  {/* Dean can approve, clarify with departments, reject, forward */}
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                  <option value="clarify">Request Clarification</option>
                  <option value="forward">Forward</option>
                </>
              ) : (
                <>
                  {/* Default for other users - all actions */}
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                  {canRequestClarification && (
                    <option value="clarify">Request Clarification</option>
                  )}
                  <option value="forward">Forward</option>
                </>
              )}
            </select>
          </div>
          
          {/* Show clarify target selection for Institution Manager and Dean only */}
          {action === 'clarify' && !isClarificationOnlyUser && (userRole === 'institution_manager' || userRole === 'dean') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clarification Target
              </label>
              <select
                value={clarifyTarget}
                onChange={e => setClarifyTarget(e.target.value as 'sop' | 'accountant' | 'mma' | 'hr' | 'audit' | 'it')}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                required
              >
                <option value="">Select target...</option>
                {userRole === 'institution_manager' && (
                  <>
                    {/* Institution Manager can clarify with SOP Verifier and Accountant */}
                    <option value="sop">SOP Verifier (Material Check)</option>
                    <option value="accountant">Accountant (Budget Check)</option>
                  </>
                )}
                {userRole === 'dean' && (
                  <>
                    {/* Dean can clarify with the 4 department users */}
                    <option value="mma">MMA (Department)</option>
                    <option value="hr">HR (Department)</option>
                    <option value="audit">Audit (Department)</option>
                    <option value="it">IT (Department)</option>
                  </>
                )}
              </select>
            </div>
          )}

          {/* Show clarification response note for clarification-only users */}
          {action === 'clarify' && isClarificationOnlyUser && isClarificationStatus && (
            <div>
              <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded-md">
                You are responding to a clarification request. Please provide the requested information in the notes section below.
              </p>
            </div>
          )}
          {action === 'forward' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Forward Message
              </label>
              <textarea
                value={forwardedMessage}
                onChange={(e) => setForwardedMessage(e.target.value)}
                rows={3}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                placeholder="Enter message for forwarding..."
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                placeholder="Enter notes..."
              />
            </div>
          )}
          
          {(action === 'approve' || action === 'budget_check') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget Available
              </label>
              <div className="flex space-x-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={budgetAvailable === true}
                    onChange={() => setBudgetAvailable(true)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2">Yes</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={budgetAvailable === false}
                    onChange={() => setBudgetAvailable(false)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2">No</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={budgetAvailable === null}
                    onChange={() => setBudgetAvailable(null)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2">Not Applicable</span>
                </label>
              </div>
            </div>
          )}
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Document Attachments
              </label>
              <div className="flex space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                  disabled={isUploading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={handleAddAttachmentUrl}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Add URL
                </button>
              </div>
            </div>
            
            {/* Uploaded files */}
            {uploadedFiles.length > 0 && (
              <ul className="border rounded-md divide-y mt-2">
                {uploadedFiles.map((file, index) => (
                  <li key={index} className="flex justify-between items-center p-2">
                    <span className="text-sm truncate flex-1 mr-2">{file.filename}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            
            {/* URL attachments */}
            {attachments.length > 0 && (
              <ul className="border rounded-md divide-y mt-2">
                {attachments.map((attachment, index) => (
                  <li key={index} className="flex justify-between items-center p-2">
                    <span className="text-sm truncate flex-1 mr-2">{attachment}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachmentUrl(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            
            {uploadedFiles.length === 0 && attachments.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">No attachments added</p>
            )}
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Processing...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}