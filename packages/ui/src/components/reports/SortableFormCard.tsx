import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Typography,
  Chip,
  Stack,
  Box,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { ReportForm } from '@form-shot/shared/src/types/report-types';

interface SortableFormCardProps {
  form: ReportForm;
  isSelected: boolean;
  onToggle: (formId: string) => void;
  isDragging?: boolean;
}

const SortableFormCard: React.FC<SortableFormCardProps> = ({
  form,
  isSelected,
  onToggle,
  isDragging = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isCurrentlyDragging,
  } = useSortable({ id: form.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isCurrentlyDragging ? 0.5 : 1,
    zIndex: isCurrentlyDragging ? 1000 : 'auto',
  };

  const labelId = `form-list-label-${form.id}`;

  return (
    <Box ref={setNodeRef} style={style}>
      <ListItem
        dense
        sx={{
          cursor: isCurrentlyDragging ? 'grabbing' : 'pointer',
          backgroundColor: isCurrentlyDragging ? 'action.hover' : 'background.paper',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          position: 'relative',
        }}
      >
        <ListItemIcon 
          sx={{ 
            minWidth: 40,
            cursor: isCurrentlyDragging ? 'grabbing' : 'grab',
          }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon 
            sx={{ 
              color: isCurrentlyDragging ? 'primary.main' : 'text.disabled',
            }} 
          />
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 40 }}>
          <Checkbox
            edge="start"
            checked={isSelected}
            tabIndex={-1}
            disableRipple
            inputProps={{ 'aria-labelledby': labelId }}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(form.id);
            }}
          />
        </ListItemIcon>
        <ListItemText
          id={labelId}
          primaryTypographyProps={{ component: 'div' }}
          secondaryTypographyProps={{ component: 'div' }}
          primary={
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body1">
                Form {form.formIndex + 1}: {form.longTitle}
              </Typography>
              {form.shortName && (
                <Typography variant="body2" color="text.secondary">
                  ({form.shortName})
                </Typography>
              )}
            </Stack>
          }
          secondary={
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip
                label={`${form.questionCount} questions`}
                size="small"
                variant="outlined"
              />
              {form.hasOnExitScreenshot && (
                <Chip
                  label="Exit screenshot"
                  size="small"
                  color="success"
                  variant="outlined"
                />
              )}
              {form.hasOnEntryScreenshot && (
                <Chip
                  label="Entry screenshot"
                  size="small"
                  color="info"
                  variant="outlined"
                />
              )}
            </Stack>
          }
          onClick={() => onToggle(form.id)}
        />
      </ListItem>
    </Box>
  );
};

export default SortableFormCard;