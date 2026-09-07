import React, { useState } from 'react'
import { CheckCircle, ShieldAlert, Trash2, Eye, EyeOff, Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ExcludedMediaItem } from '../../types/game'
import { createFallbackPhotoCard } from '../../utils/imageCompression'

interface ImagePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  items: Array<ExcludedMediaItem & { dataUrl: string; type: 'image' | 'video' }>
  onToggleExclude: (id: string) => void
  onRemovePhoto: (id: string) => void
  onConfirm: () => void
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  items,
  onToggleExclude,
  onRemovePhoto,
  onConfirm,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'excluded' | 'accepted'>('all')

  const acceptedItems = items.filter((i) => !i.isExcluded)
  const excludedItems = items.filter((i) => i.isExcluded)

  const filteredItems =
    activeTab === 'all'
      ? items
      : activeTab === 'excluded'
      ? excludedItems
      : acceptedItems

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review Uploaded Photos" maxWidth="xl">
      <div className="space-y-4">
        {/* Filter Summary Banner */}
        <div className="bg-gradient-to-r from-violet-950/60 to-purple-900/40 border border-violet-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-white font-bold flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-400" />
              <span>
                {acceptedItems.length} photos ready for roulette
              </span>
            </h4>
            {excludedItems.length > 0 ? (
              <p className="text-xs text-amber-300 mt-0.5 flex items-center gap-1.5">
                <ShieldAlert size={14} />
                <span>
                  {excludedItems.length} document{excludedItems.length > 1 ? 's' : ''}/receipt{excludedItems.length > 1 ? 's' : ''} auto-excluded for your privacy.
                </span>
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">
                No sensitive documents detected. All photos look great!
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="success" onClick={onConfirm}>
              <Check size={16} />
              Confirm ({acceptedItems.length})
            </Button>
          </div>
        </div>

        {/* Tab filters */}
        <div className="flex gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'bg-violet-600 text-white'
                : 'text-gray-400 hover:text-white bg-white/5'
            }`}
          >
            All Photos ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('accepted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'accepted'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-400 hover:text-white bg-white/5'
            }`}
          >
            Accepted ({acceptedItems.length})
          </button>
          {excludedItems.length > 0 && (
            <button
              onClick={() => setActiveTab('excluded')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'excluded'
                  ? 'bg-amber-600 text-white'
                  : 'text-gray-400 hover:text-white bg-white/5'
              }`}
            >
              Excluded Documents ({excludedItems.length})
            </button>
          )}
        </div>

        {/* Photo Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No photos in this category.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`group relative rounded-2xl overflow-hidden border transition-all duration-150 ${
                  item.isExcluded
                    ? 'border-red-500/50 bg-red-950/20 opacity-85'
                    : 'border-white/15 bg-black/30'
                }`}
              >
                {/* Thumbnail */}
                <div className="aspect-[4/3] w-full overflow-hidden bg-black/60 relative">
                  <img
                    src={item.previewUrl || item.dataUrl}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.src = createFallbackPhotoCard('Photo')
                    }}
                    className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${
                      item.isExcluded ? 'filter blur-[2px] brightness-75' : ''
                    }`}
                  />

                  {/* Status Overlay Badge */}
                  <div className="absolute top-2 left-2">
                    {item.isExcluded ? (
                      <Badge variant="danger" size="sm">
                        <ShieldAlert size={12} /> Excluded
                      </Badge>
                    ) : (
                      <Badge variant="success" size="sm">
                        <Check size={12} /> In Game
                      </Badge>
                    )}
                  </div>

                  {/* Top-right Actions */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={() => onRemovePhoto(item.id)}
                      className="p-1.5 rounded-lg bg-black/70 hover:bg-red-600 text-white transition-colors cursor-pointer"
                      title="Permanently remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Card Details & Actions */}
                <div className="p-2.5 bg-[#141223] text-xs">
                  {item.isExcluded ? (
                    <div>
                      <p className="text-red-300 font-medium truncate" title={item.reason}>
                        {item.reason}
                      </p>
                      <button
                        onClick={() => onToggleExclude(item.id)}
                        className="mt-2 w-full py-1 rounded-lg bg-white/10 hover:bg-emerald-600 text-white font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Eye size={13} /> Include Anyway
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 truncate">Safe to play</span>
                      <button
                        onClick={() => onToggleExclude(item.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-amber-400 transition-colors cursor-pointer"
                        title="Exclude from game"
                      >
                        <EyeOff size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-white/10 flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" size="md" onClick={onConfirm}>
            Ready with {acceptedItems.length} photos
          </Button>
        </div>
      </div>
    </Modal>
  )
}
