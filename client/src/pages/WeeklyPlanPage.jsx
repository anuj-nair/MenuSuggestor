import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { getPlan, generatePlan, refreshDay } from '../api/plan.api.js';
import { getMeals } from '../api/meals.api.js';
import DayCard from '../components/DayCard.jsx';
import WeekGenerateControls from '../components/WeekGenerateControls.jsx';
import Banner from '../components/Banner.jsx';

export default function WeeklyPlanPage() {
  const { data, loading, error, refetch } = useFetch(() => getPlan(), []);
  const { data: activeMeals } = useFetch(() => getMeals({ active: 1 }), []);
  const hasNoMeals = activeMeals && activeMeals.length === 0;
  const [generating, setGenerating] = useState(false);
  const [refreshingDate, setRefreshingDate] = useState(null);
  const [dayWarnings, setDayWarnings] = useState({});
  const [banner, setBanner] = useState(null);

  const handleGenerate = async ({ include_free_day }) => {
    setGenerating(true);
    setBanner(null);
    setDayWarnings({});
    try {
      const result = await generatePlan({ include_free_day });
      if (result.warnings?.length) {
        setBanner({ type: 'warning', text: result.warnings.join(' ') });
      }
      if (result.skipped_dates?.length) {
        setBanner((prev) => ({
          type: 'info',
          text: `${prev ? prev.text + ' ' : ''}Kept ${result.skipped_dates.length} day(s) already marked eaten.`,
        }));
      }
      refetch();
    } catch (err) {
      if (err.body?.code === 'NO_MEALS') {
        setBanner({
          type: 'info',
          text: (
            <>
              You don't have any recipes yet. <Link to="/manage/meals">Add recipes</Link> and then generate your week.
            </>
          ),
        });
      } else {
        setBanner({ type: 'error', text: err.message });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRefresh = async (date, force) => {
    setRefreshingDate(date);
    try {
      const result = await refreshDay(date, force);
      if (result.warning) {
        setDayWarnings((prev) => ({ ...prev, [date]: result.warning }));
      } else {
        setDayWarnings((prev) => {
          const next = { ...prev };
          delete next[date];
          return next;
        });
      }
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setRefreshingDate(null);
    }
  };

  return (
    <div className="page">
      <h1>This Week's Plan</h1>
      <p className="page-subtitle">One meal a day, balanced across grains and proteins.</p>

      <WeekGenerateControls onGenerate={handleGenerate} generating={generating} />

      <Banner type={banner?.type} onDismiss={() => setBanner(null)}>
        {banner?.text}
      </Banner>

      {loading && <p>Loading plan...</p>}
      {error && <Banner type="error">{error.message}</Banner>}

      {data && (
        <div className="week-grid">
          {data.days.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              onRefresh={handleRefresh}
              refreshing={refreshingDate === day.date}
              warning={dayWarnings[day.date]}
              onDismissWarning={() =>
                setDayWarnings((prev) => {
                  const next = { ...prev };
                  delete next[day.date];
                  return next;
                })
              }
            />
          ))}
        </div>
      )}

      {data && data.days.every((d) => !d.meal_type) && hasNoMeals && (
        <p className="empty-state">
          You don't have any recipes yet. <Link to="/manage/meals">Add a few on the Manage page</Link> and then
          generate your week.
        </p>
      )}

      {data && data.days.every((d) => !d.meal_type) && !hasNoMeals && (
        <p className="empty-state">
          No plan yet — click "Generate / Regenerate Week" to get started. Make sure you've added
          meals for each type in the Manage page first.
        </p>
      )}
    </div>
  );
}
