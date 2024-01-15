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
Rally.ui.combobox.MilestoneComboBox.prototype.beforeQuery= function(queryPlan) {
    var queryString = queryPlan.query,
    filter = Ext.create('Rally.data.wsapi.Filter', {
        property: 'Name',
        operator: 'contains',
        value: queryString
    });
    // stateFilter1 =  Ext.create('Rally.data.wsapi.Filter', {
    //     property: 'State',
    //     operator: '=',
    //     value: "Idea Prioritization"
    // }),
    // stateFilter2 =  Ext.create('Rally.data.wsapi.Filter', {
    //     property: 'State',
    //     operator: '=',
    //     value: "Problem Discovery"
    // }),
    // stateFilter3 =  Ext.create('Rally.data.wsapi.Filter', {
    //     property: 'State',
    //     operator: '=',
    //     value: "Solution Discovery"
    // }),
    // stateFilters = stateFilter1.or(stateFilter2).or(stateFilter3);

    // var loadArtifactsByMilestone = function(milestone){
    //     var artifacts = milestone.Artifacts;
    //     var stateQuery = '(((State = "Idea Prioritization") OR (State = "Problem Discovery")) OR (State = "Solution Discovery")) ';
    //     var urlForArtifacts = artifacts._ref + "?start=1&pagesize=" + artifacts.Count + '&query='+ encodeURI(stateQuery);
    //     var response = Ext.Ajax.request({
    //         async: false,
    //         url: urlForArtifacts,
    //         method: "GET",
    //     });

    //     if (response.status == 200){
    //         var responseTextObj = Ext.JSON.decode(response.responseText).QueryResult;
    //         if (responseTextObj !== undefined)
    //         {
    //             responseTextObj = responseTextObj.Results;
    //             if (responseTextObj.length > 0){
    //                 return true;
    //             }
    //         }
            
    //     }
    //     return false;
    // }

    // var response = Ext.Ajax.request({
    //     async: false,
    //     url: 'https://rally1.rallydev.com/slm/webservice/v2.0/milestones?fetch=Artifacts,FormattedID&pagesize=200',
    //     method: "GET",
    // });
    // var filters = undefined;
    // if (response.status == 200){
    //     var responseTextObj = Ext.JSON.decode(response.responseText).QueryResult.Results;                
    //     for (var inx = 0; inx< responseTextObj.length; inx++){
    //         if (loadArtifactsByMilestone(responseTextObj[inx])){
    //             var mileStoneFilter =  Ext.create('Rally.data.wsapi.Filter', {
    //                 property: 'FormattedID',
    //                 operator: '=',
    //                 value: responseTextObj.FormattedID
    //             });
    //             if (filters == undefined)
    //                 filters = Rally.data.wsapi.Filter.or(mileStoneFilter);
    //             else
    //                 filters = filters.or(mileStoneFilter);
    //         }
    //     }
        
    // }
    // console.log(filters);

    this.store.filters = this.store.filters.filterBy(function(item) {
        return item.property !== 'Name' && item.property !== 'ObjectID';
    });

    if (queryString) {
        queryPlan.query = Rally.data.wsapi.Filter.and(this.store.filters.getRange()).and(filter).toString();
    } else {
        queryPlan.query = Rally.data.wsapi.Filter.and(this.store.filters.getRange()).toString();
    }
    
    queryPlan.forceAll = true;

    return queryPlan;
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

// Rally.ui.inlinefilter.QuickFilterPanel.prototype._createField = function(filterIndex, field, initialValues) {
//     console.log(filterIndex, field, initialValues);
//     var fieldName = field.name || field,
//         modelField = this.model.getField(fieldName),
//         fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfig(this.model, fieldName, this.context),
//         initialValue = initialValues && initialValues[fieldConfig.name] && initialValues[fieldConfig.name].rawValue;

//     if (modelField && modelField.isDate() && initialValue) {
//         initialValue = Rally.util.DateTime.fromIsoString(initialValue);
//     }

//     initialValue = Rally.ui.inlinefilter.FilterFieldFactory.getInitialValueForLegacyFilter(fieldConfig, initialValue);
//     fieldConfig = Rally.ui.inlinefilter.FilterFieldFactory.getFieldConfigForLegacyFilter(fieldConfig, initialValue);

//     Ext.applyIf(fieldConfig, {
//         allowClear: true
//     });

//     Ext.merge(fieldConfig, {
//         autoExpand: this.autoExpand,
//         allowBlank: true,
//         clearText: '-- Clear Filter --',
//         hideLabel: false,
//         fieldLabel: ' ',
//         labelAlign: 'top',
//         labelSeparator: '',
//         enableKeyEvents: true,
//         margin: 0,
//         cls: this.isCustomMatchType() ? 'indexed-field' : '',
//         beforeLabelTextTpl: [
//             '<span class="filter-index">{[this.getFilterIndex()]}</span>',
//             {
//                 filterIndex: filterIndex,
//                 displayIndex: this.isCustomMatchType(),
//                 getFilterIndex: function() {
//                     return this.displayIndex ? Ext.String.format('({0}) ', this.filterIndex) : '';
//                 }
//             }
//         ],
//         model: this.model,
//         context: this.context,
//         operator: this._getOperatorForModelField(modelField),
//         afterSubTpl: '<span class="remove-quick-filter-icon icon-cross"></span>',
//         renderSelectors: {
//             removeIcon: '.remove-quick-filter-icon'
//         },
//         listeners: {
//             afterrender: function (field) {
//                 field.removeIcon.on('click', _.partial(this._removeQuickFilter, field), this);
//             },
//             scope: this
//         }
//     });

//     if (!_.isUndefined(initialValue)) {
//         Ext.merge(fieldConfig, {
//             value: initialValue
//         });
//     }

//     if (_.isPlainObject(field)) {
//         Ext.apply(fieldConfig, field);
//     }

//     if (filterIndex === 1) {
//         fieldConfig.itemId = this.self.FOCUS_CMP_ITEM_ID;
//     }

//     if (this._shouldApplyFiltersOnSelect(fieldConfig)) {
//         Ext.merge(fieldConfig, {
//             autoSelect: true,
//             listeners: {
//                 select: this._applyFilters,
//                 scope: this
//             }
//         });
//     } else {
//         Ext.merge(fieldConfig, {
//             listeners: {
//                 change: this._applyFilters,
//                 scope: this
//             }
//         });
//     }
//     console.log(fieldConfig);
//     return Ext.widget(fieldConfig);
// };
Ext.override(Rally.ui.gridboard.GridBoard, {
    getInlineFilterPanel: function() {
        return this.down('#customFilterPanel');
    },

});