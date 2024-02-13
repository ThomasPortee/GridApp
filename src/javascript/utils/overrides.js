// Remove 'Actuals' from the blacklist
Ext.override(Rally.ui.gridboard.plugin.GridBoardFieldPicker, {
    gridFieldBlackList: [
        // 'Actuals',
        'Changesets',
        'Children',
        // 'Description',
        // 'Notes',
        'ObjectID',
        'Predecessors',
        'RevisionHistory',
        'Subscription',
        'Successors',
        'TaskIndex',
        'Workspace',
        'VersionId',
        'Project'
    ]
});

Ext.override(Rally.ui.inlinefilter.PropertyFieldComboBox, {
    /**
     * @cfg {String[]} whiteListFields
     * field names that should be included from the filter row field combobox
     */
    defaultWhiteListFields: ['Milestones', 'Tags']
});

Ext.override(Rally.ui.grid.TreeGrid, {
    // Override needed to allow summaryType to be restored when a column with
    // summaryType config is added by the field picker
    _mergeColumnConfigs: function(newColumns, oldColumns) {
        return _.map(newColumns, function(newColumn) {
            // If the newly selected column is currently in oldColumns (this.columns), then
            // use the in-use column config to preserve its current settings
            var result = newColumn;
            var newColumnName = this._getColumnName(newColumn);
            var oldColumn = _.find(oldColumns, { dataIndex: newColumnName });
            if (oldColumn) {
                result = this._getColumnConfigFromColumn(oldColumn);
            }
            else if (this.config && this.config.columnCfgs) {
                // Otherwise, if the newly selected column appears in the original columnCfgs
                // use that config. (This allows the column picker to get any renderers or summary
                // config from the column config)
                var columnCfg = _.find(this.config.columnCfgs, { dataIndex: newColumnName });
                if (columnCfg) {
                    result = columnCfg;
                }
            }
            console.log('_mergeColumnConfigs', result);
            return result;
        }, this);
    },

    // Override needed to allow summaryType to be included when a column is restored
    // from state.
    _applyStatefulColumns: function(columns) {
        // TODO (tj) test default columns
        if (this.alwaysShowDefaultColumns) {
            _.each(this.columnCfgs, function(columnCfg) {
                if (!_.any(columns, { dataIndex: this._getColumnName(columnCfg) })) {
                    columns.push(columnCfg);
                }
            }, this);
        }

        if (this.config && this.config.columnCfgs) {
            // Merge the column config with the stateful column if the dataIndex is the same.
            // This allows use to pick up summaryType and custom renderers
            _.each(this.config.columnCfgs, function(columnCfg) {
                // Search by dataIndex or text
                var columnName = this._getColumnName(columnCfg);
                var columnState = _.find(columns, function(value) {
                    return (value.dataIndex === columnName || value.text === columnName);
                });
                if (columnState) {
                    // merge them (add renderer)
                    _.merge(columnState, columnCfg);
                }
            }, this);
        }

        this.columnCfgs = columns;
    }
});


Rally.ui.inlinefilter.AdvancedFilterRow.prototype._createOperatorField =  function() {
    this.operatorField = Ext.widget(Ext.merge({
        xtype: 'rallyoperatorfieldcombobox',
        itemId: 'operatorField',
        cls: 'operator-field',
        width: 80,
        autoExpand: this.autoExpand,
        labelAlign: 'top',
        fieldLabel: 'OPERATOR',
        labelSeparator: '',
        matchFieldWidth: true,
        disabled: !(this._hasPropertySelected()),
        property: this._hasPropertySelected() ? this.propertyField.getValue() : undefined,
        value: this.operator,
        model: this.model,
        customOperatorField: "Milestones",
        context: this.context,
        listeners: {
            select: this._onOperatorSelect,
            scope: this
        }
    }, this.operatorFieldConfig));
};


Rally.ui.inlinefilter.OperatorFieldComboBox.prototype._getAllowedQueryOperatorStore=  function() {
    var storeConfig = {
        fields: ['name', 'displayName', 'OperatorName'],
        filters:[
            {   property: 'OperatorName',
                operator: '!=',
                value: 'containsall'
            },
            {   property: 'OperatorName',
                operator: '!=',
                value: 'containsany'
            }
        ],
        listeners: {
            load: function(store, records) {
                var customizedOperator = this.model.getField(this.property).name == "Milestones" &&
                 this.customOperatorField == "Milestones";
                
                _.each(records, function (record) {
                    var operatorName = record.get('OperatorName');
                    record.set('name', customizedOperator? '?' + operatorName : operatorName);
                    record.set('displayName', store.shouldReplaceOperatorName ? operatorName.replace('contains', '=') : operatorName);
                    record.commit(false);
                }, this);

                store.add(this.additionalOperators);
                store.commitChanges();
            },
            scope: this
        }
    };

    if (this.property) {
        var field = this.model.getField(this.property),
            store = field.getAllowedQueryOperatorStore();

        if (store) {
            storeConfig.autoLoad = false;
            storeConfig.proxy = store.proxy.clone();
            storeConfig.shouldReplaceOperatorName = field.isCollection();
        }
    }
    return Ext.create('Ext.data.Store', storeConfig);
};

Ext.override(Rally.ui.gridboard.GridBoard, {
    getInlineFilterPanel: function() {
        return this.down('#customFilterPanel');
    },
});

Rally.ui.tree.PagingToolbar.prototype._onSubsequentLoads= function(store, node, records, successful, options) {
    var hasTopLevelRecord = _.any(records, function(record) {
        var isChildRecord = record.get('depth') > 1;
        return !isChildRecord;
    });
    if (hasTopLevelRecord || records.length == 0) {
        this._reRender();
    }
    this._recordMetricsEnd();
}

Ext.form.field.ComboBox.prototype.doQuery= function(queryString, forceAll, rawQuery) {
    
    var me = this,

        // Decide if, and how we are going to query the store
        queryPlan = me.beforeQuery({
            query: queryString || '',
            rawQuery: rawQuery,
            forceAll: forceAll,
            combo: me,
            cancel: false
        });

    // Allow veto.
    if (queryPlan === false || queryPlan.cancel) {
        return false;
    }

    // If they're using the same value as last time, just show the dropdown
    if (me.queryCaching && queryPlan.query === me.lastQuery) {
        me.expand();
        if (me.queryMode === 'local') {
            me.doAutoSelect();
        }
    }
    
    // Otherwise filter or load the store
    else {
        me.lastQuery = queryPlan.query;
        if (me.queryMode === 'local') {
            me.doLocalQuery(queryPlan);
        } else {
            me.doRemoteQuery(queryPlan);
        }
    }

    return true;
}
