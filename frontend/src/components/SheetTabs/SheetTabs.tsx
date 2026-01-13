import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, MoreVertical } from 'lucide-react';
import { Sheet } from '../../api/client';

interface SheetTabsProps {
    sheets: Sheet[];
    activeSheetId: string | null;
    onSheetChange: (sheetId: string) => void;
    onAddSheet: () => void;
    onDeleteSheet: (sheetId: string) => void;
    onRenameSheet: (sheetId: string, newName: string) => void;
}

export const SheetTabs: React.FC<SheetTabsProps> = ({
    sheets,
    activeSheetId,
    onSheetChange,
    onAddSheet,
    onDeleteSheet,
    onRenameSheet
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sheetId: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleDoubleClick = (sheet: Sheet) => {
        setEditingId(sheet.id);
        setEditName(sheet.name);
    };

    const handleKeyDown = (e: React.KeyboardEvent, sheetId: string) => {
        if (e.key === 'Enter') {
            if (editName.trim()) {
                onRenameSheet(sheetId, editName.trim());
            }
            setEditingId(null);
        } else if (e.key === 'Escape') {
            setEditingId(null);
        }
    };

    const handleBlur = (sheetId: string) => {
        if (editName.trim()) {
            onRenameSheet(sheetId, editName.trim());
        }
        setEditingId(null);
    };

    const handleContextMenu = (e: React.MouseEvent, sheetId: string) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            sheetId
        });
    };

    return (
        <div className="flex items-center h-10 bg-slate-100 border-t border-slate-300 px-2 select-none">
            {/* Scrollable Tabs Area */}
            <div className="flex items-end overflow-x-auto no-scrollbar max-w-[calc(100%-40px)]">
                {sheets.map(sheet => {
                    const isActive = sheet.id === activeSheetId;
                    return (
                        <div
                            key={sheet.id}
                            className={`
                                group relative flex items-center min-w-[100px] max-w-[200px] h-8 px-3 mr-1 
                                border-t border-x rounded-t-md cursor-pointer text-sm transition-colors
                                ${isActive
                                    ? 'bg-white border-slate-300 border-b-white text-emerald-700 font-semibold z-10'
                                    : 'bg-slate-200 border-slate-300 border-b-slate-300 text-slate-600 hover:bg-slate-50'
                                }
                            `}
                            onClick={() => onSheetChange(sheet.id)}
                            onDoubleClick={() => handleDoubleClick(sheet)}
                            onContextMenu={(e) => handleContextMenu(e, sheet.id)}
                        >
                            {editingId === sheet.id ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, sheet.id)}
                                    onBlur={() => handleBlur(sheet.id)}
                                    className="w-full h-full bg-transparent outline-none text-center"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="truncate w-full text-center">{sheet.name}</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Add Sheet Button */}
            <button
                onClick={onAddSheet}
                className="ml-2 p-1 text-slate-500 hover:bg-slate-200 rounded-full transition-colors"
                title="Add Sheet"
            >
                <Plus size={18} />
            </button>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white border border-slate-200 shadow-lg rounded-md py-1 z-50 min-w-[120px]"
                    style={{ top: contextMenu.y - 40, left: contextMenu.x }}
                >
                    <button
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                        onClick={() => {
                            const sheet = sheets.find(s => s.id === contextMenu.sheetId);
                            if (sheet) handleDoubleClick(sheet);
                            setContextMenu(null);
                        }}
                    >
                        Rename
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => {
                            onDeleteSheet(contextMenu.sheetId);
                            setContextMenu(null);
                        }}
                    >
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
};
