import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Box,
  List,
  Paper,
  Typography,
  Stack,
  Button,
  Divider,
  Portal,
} from '@mui/material';
import { ReportForm } from '@form-shot/shared/src/types/report-types';
import SortableFormCard from './SortableFormCard';

interface FormListProps {
  availableForms: ReportForm[];
  selectedForms: string[];
  formOrder: string[];
  onSelectionChange: (selectedFormIds: string[]) => void;
  onOrderChange: (newOrder: string[]) => void;
}

const FormList: React.FC<FormListProps> = ({
  availableForms,
  selectedForms,
  formOrder,
  onSelectionChange,
  onOrderChange,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleToggle = (formId: string) => {
    const currentIndex = selectedForms.indexOf(formId);
    const newSelected = [...selectedForms];

    if (currentIndex === -1) {
      newSelected.push(formId);
    } else {
      newSelected.splice(currentIndex, 1);
    }

    onSelectionChange(newSelected);
  };

  const handleSelectAll = () => {
    onSelectionChange(availableForms.map(f => f.id));
  };

  const handleSelectNone = () => {
    onSelectionChange([]);
  };

  // Sort forms based on formOrder for display
  const sortedForms = [...availableForms].sort((a, b) => {
    const aIndex = formOrder.indexOf(a.id);
    const bIndex = formOrder.indexOf(b.id);
    
    // If both are in formOrder, sort by their order
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    
    // If only one is in formOrder, it comes first
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    
    // If neither is in formOrder, sort by formIndex
    return a.formIndex - b.formIndex;
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedForms.findIndex((form) => form.id === active.id);
      const newIndex = sortedForms.findIndex((form) => form.id === over.id);

      const newSortedForms = arrayMove(sortedForms, oldIndex, newIndex);
      onOrderChange(newSortedForms.map(f => f.id));
    }

    setActiveId(null);
  };

  const activeForm = activeId ? sortedForms.find(f => f.id === activeId) : null;

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button size="small" onClick={handleSelectAll}>
          Select All
        </Button>
        <Button size="small" onClick={handleSelectNone}>
          Clear Selection
        </Button>
        <Typography variant="body2" sx={{ ml: 'auto', alignSelf: 'center' }}>
          {selectedForms.length} of {availableForms.length} forms selected
        </Typography>
      </Stack>

      <Paper variant="outlined">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedForms.map(f => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <List sx={{ p: 0 }}>
              {sortedForms.map((form, index) => {
                const isSelected = selectedForms.includes(form.id);

                return (
                  <React.Fragment key={form.id}>
                    {index > 0 && <Divider />}
                    <SortableFormCard
                      form={form}
                      isSelected={isSelected}
                      onToggle={handleToggle}
                    />
                  </React.Fragment>
                );
              })}
            </List>
          </SortableContext>

          <Portal>
            <DragOverlay>
              {activeForm ? (
                <Paper
                  elevation={8}
                  sx={{
                    width: '100%',
                    maxWidth: 800,
                    opacity: 0.9,
                  }}
                >
                  <SortableFormCard
                    form={activeForm}
                    isSelected={selectedForms.includes(activeForm.id)}
                    onToggle={handleToggle}
                    isDragging
                  />
                </Paper>
              ) : null}
            </DragOverlay>
          </Portal>
        </DndContext>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Drag forms using the handle to reorder them for PDF generation
      </Typography>
    </Box>
  );
};

export default FormList;